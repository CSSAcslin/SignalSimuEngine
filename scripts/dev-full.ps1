$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$python = Join-Path $root ".venv\Scripts\python.exe"
$pnpm = "C:\Users\Admin\AppData\Local\pnpm\bin\pnpm.cmd"

if (-not (Test-Path $python)) {
  throw "Project virtual environment not found at $python"
}

$backend = Start-Process `
  -FilePath $python `
  -ArgumentList @("-m", "uvicorn", "backend.server:app", "--host", "127.0.0.1", "--port", "8765") `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -PassThru

try {
  & $pnpm dev
} finally {
  if ($backend -and -not $backend.HasExited) {
    Stop-Process -Id $backend.Id
  }
}
