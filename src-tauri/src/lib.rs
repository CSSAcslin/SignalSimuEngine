#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_time_frequency_analysis, run_external_command_module])
        .run(tauri::generate_context!())
        .expect("error while running SignalForge");
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TimeFrequencyRequest {
    method: String,
    sample_rate: f64,
    values: Vec<f64>,
    params: serde_json::Value,
}

#[derive(serde::Deserialize, serde::Serialize)]
struct TimeFrequencyResponse {
    time: Vec<f64>,
    frequency: Vec<f64>,
    power: Vec<Vec<f64>>,
    unit: String,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalCommandInput {
    id: String,
    name: String,
    sample_rate: f64,
    unit: String,
    time: Vec<f64>,
    values: Vec<f64>,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalCommandRequest {
    node_id: String,
    name: String,
    executable_path: String,
    arguments: String,
    timeout_ms: u64,
    sample_rate: f64,
    inputs: Vec<ExternalCommandInput>,
    params: serde_json::Value,
}

#[derive(serde::Deserialize, serde::Serialize)]
struct ExternalCommandSignalResponse {
    #[serde(rename = "type")]
    result_type: String,
    values: Vec<f64>,
    unit: Option<String>,
    warnings: Option<Vec<String>>,
    metadata: Option<serde_json::Value>,
}

#[tauri::command]
fn run_time_frequency_analysis(request: TimeFrequencyRequest) -> Result<TimeFrequencyResponse, String> {
    use std::io::Write;
    use std::path::PathBuf;
    use std::process::{Command, Stdio};

    const PY_SCRIPT: &str = include_str!("../python/time_frequency.py");
    let payload = serde_json::to_string(&request).map_err(|error| error.to_string())?;
    let python = project_python().unwrap_or_else(|| PathBuf::from("python"));
    let mut child = Command::new(python)
        .arg("-c")
        .arg(PY_SCRIPT)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Unable to start Python backend: {error}"))?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(payload.as_bytes()).map_err(|error| error.to_string())?;
    }

    let output = child.wait_with_output().map_err(|error| error.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Python time-frequency backend failed.".to_string()
        } else {
            stderr
        });
    }

    serde_json::from_slice(&output.stdout).map_err(|error| format!("Invalid Python backend response: {error}"))
}

#[tauri::command]
fn run_external_command_module(request: ExternalCommandRequest) -> Result<ExternalCommandSignalResponse, String> {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Stdio;
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    if request.executable_path.trim().is_empty() {
        return Err("External command executable path is empty.".to_string());
    }
    let executable = PathBuf::from(&request.executable_path);
    if !executable.exists() {
        return Err(format!("External command executable does not exist: {}", executable.display()));
    }

    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let work_dir = std::env::temp_dir().join(format!("signalforge-external-{}-{suffix}", request.node_id));
    fs::create_dir_all(&work_dir).map_err(|error| format!("Unable to create external command temp dir: {error}"))?;
    let input_path = work_dir.join("request.json");
    let output_path = work_dir.join("result.json");
    let request_payload = serde_json::to_string_pretty(&request).map_err(|error| error.to_string())?;
    fs::write(&input_path, request_payload).map_err(|error| format!("Unable to write external command request: {error}"))?;

    let rendered_arguments = request
        .arguments
        .replace("{input}", &input_path.to_string_lossy())
        .replace("{output}", &output_path.to_string_lossy());
    let args = split_command_arguments(&rendered_arguments)?;
    let mut command = external_command_process(&executable, &args);
    command
        .current_dir(executable.parent().unwrap_or_else(|| Path::new(".")))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let timeout = Duration::from_millis(request.timeout_ms.max(1000));
    let mut child = command
        .spawn()
        .map_err(|error| format!("Unable to start external command module: {error}"))?;
    let started = Instant::now();
    loop {
        if child
            .try_wait()
            .map_err(|error| format!("Unable to wait for external command module: {error}"))?
            .is_some()
        {
            break;
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("External command timed out after {} ms.", timeout.as_millis()));
        }
        std::thread::sleep(Duration::from_millis(20));
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Unable to collect external command output: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("External command exited with status {}.", output.status)
        });
    }
    if !output_path.exists() {
        return Err(format!("External command did not create result file: {}", output_path.display()));
    }

    let result_bytes = fs::read(&output_path).map_err(|error| format!("Unable to read external command result: {error}"))?;
    let result: ExternalCommandSignalResponse =
        serde_json::from_slice(&result_bytes).map_err(|error| format!("Invalid external command result JSON: {error}"))?;
    if result.result_type != "signal" {
        return Err(format!("Unsupported external command result type: {}", result.result_type));
    }
    if result.values.is_empty() {
        return Err("External command signal result must contain at least one value.".to_string());
    }
    let _ = fs::remove_dir_all(&work_dir);
    Ok(result)
}

fn external_command_process(executable: &std::path::Path, args: &[String]) -> std::process::Command {
    #[cfg(windows)]
    {
        let extension = executable
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase());
        if matches!(extension.as_deref(), Some("bat") | Some("cmd")) {
            let mut command = std::process::Command::new("cmd");
            command.arg("/C").arg(executable);
            command.args(args);
            return command;
        }
    }

    let mut command = std::process::Command::new(executable);
    command.args(args);
    command
}

fn split_command_arguments(arguments: &str) -> Result<Vec<String>, String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    for character in arguments.chars() {
        match character {
            '\'' | '"' if quote == Some(character) => quote = None,
            '\'' | '"' if quote.is_none() => quote = Some(character),
            character if character.is_whitespace() && quote.is_none() => {
                if !current.is_empty() {
                    args.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(character),
        }
    }
    if quote.is_some() {
        return Err("External command arguments contain an unterminated quote.".to_string());
    }
    if !current.is_empty() {
        args.push(current);
    }
    Ok(args)
}

fn project_python() -> Option<std::path::PathBuf> {
    let cwd = std::env::current_dir().ok()?;
    let candidates = [
        cwd.join(".venv").join("Scripts").join("python.exe"),
        cwd.join("..").join(".venv").join("Scripts").join("python.exe"),
    ];
    candidates.into_iter().find(|path| path.exists())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should work")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("signalforge-{name}-{suffix}"));
        fs::create_dir_all(&path).expect("temp dir should be created");
        path
    }

    #[test]
    fn runs_external_command_protocol_and_reads_signal_result() {
        let dir = temp_test_dir("external-command");
        let tool_path = dir.join("tool.cmd");
        fs::write(
            &tool_path,
            "@echo off\r\nset output=%4\r\necho {\"type\":\"signal\",\"values\":[2,4],\"unit\":\"mV\",\"warnings\":[\"demo\"],\"metadata\":{\"tool\":\"fixture\"}} > %output%\r\n"
        )
        .expect("fixture should be written");

        let request = ExternalCommandRequest {
            node_id: "external".to_string(),
            name: "External Command".to_string(),
            executable_path: tool_path.to_string_lossy().to_string(),
            arguments: "--input {input} --output {output}".to_string(),
            timeout_ms: 30000,
            sample_rate: 1000.0,
            inputs: vec![ExternalCommandInput {
                id: "x".to_string(),
                name: "X".to_string(),
                sample_rate: 1000.0,
                unit: "a.u.".to_string(),
                time: vec![0.0, 0.001],
                values: vec![1.0, 2.0],
            }],
            params: serde_json::json!({ "p0": 2 }),
        };

        let result = run_external_command_module(request).expect("external command should run");

        assert_eq!(result.values, vec![2.0, 4.0]);
        assert_eq!(result.unit.as_deref(), Some("mV"));
        assert_eq!(result.warnings.as_ref().expect("warnings")[0], "demo");
    }
}
