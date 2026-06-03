#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_time_frequency_analysis])
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

#[tauri::command]
fn run_time_frequency_analysis(request: TimeFrequencyRequest) -> Result<TimeFrequencyResponse, String> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    const PY_SCRIPT: &str = include_str!("../python/time_frequency.py");
    let payload = serde_json::to_string(&request).map_err(|error| error.to_string())?;
    let mut child = Command::new("python")
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
