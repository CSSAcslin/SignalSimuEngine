$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$python = Join-Path $root ".venv\Scripts\python.exe"
$pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
$backendOut = Join-Path $env:TEMP "signalforge-backend-$PID.out.log"
$backendErr = Join-Path $env:TEMP "signalforge-backend-$PID.err.log"

if (-not (Test-Path $python)) {
  throw "Project virtual environment not found at $python"
}

if (-not $pnpm) {
  throw "pnpm.cmd was not found on PATH. Run corepack enable, then try pnpm web:full again."
}

$backend = Start-Process `
  -FilePath $python `
  -ArgumentList @("-m", "uvicorn", "backend.server:app", "--host", "127.0.0.1", "--port", "8765") `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $backendOut `
  -RedirectStandardError $backendErr `
  -PassThru

try {
  $backendReady = $false
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:8765/health" -TimeoutSec 1
      if ($health.status -eq "ok" -and $health.service -eq "signalforge-analysis") {
        $backendReady = $true
        break
      }
    } catch {
      if ($backend.HasExited) {
        break
      }
      Start-Sleep -Milliseconds 250
    }
  }

  if (-not $backendReady) {
    $detail = if (Test-Path $backendErr) { (Get-Content $backendErr -Raw).Trim() } else { "No backend error output was captured." }
    throw "SignalForge analysis backend did not become ready on port 8765. $detail"
  }

  Write-Host "SignalForge analysis backend online at http://127.0.0.1:8765"
  & $pnpm.Source dev
} finally {
  if ($backend -and -not $backend.HasExited) {
    Stop-Process -Id $backend.Id
  }
  Remove-Item -LiteralPath $backendOut, $backendErr -Force -ErrorAction SilentlyContinue
}
