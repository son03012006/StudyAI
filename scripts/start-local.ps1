$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$aiService = Join-Path $root 'ai_service'
$logs = Join-Path $root 'logs'

foreach ($requiredFile in @(
  (Join-Path $backend '.env'),
  (Join-Path $backend 'node_modules'),
  (Join-Path $frontend 'node_modules')
)) {
  if (-not (Test-Path $requiredFile)) {
    throw "Required project setup is missing: $requiredFile"
  }
}

$postgresServices = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue
if ($postgresServices -and -not ($postgresServices | Where-Object { $_.Status -eq 'Running' })) {
  $postgresServices | ForEach-Object {
    Start-Service -Name $_.Name
  }
}
if (-not (Test-NetConnection -ComputerName '127.0.0.1' -Port 5432 -InformationLevel Quiet)) {
  throw 'PostgreSQL is not listening on 127.0.0.1:5432. Start PostgreSQL and verify backend/.env.'
}

$python = Join-Path $aiService '.venv-win\Scripts\python.exe'
if (-not (Test-Path $python)) {
  $python = Join-Path $aiService '.venv\Scripts\python.exe'
}
if (-not (Test-Path $python)) {
  throw 'AI service virtual environment is missing. Follow ai_service/README.md first.'
}
$checkpoint = Join-Path $aiService 'checkpoints\studyai-xlm-roberta-viqa'
$checkpointReady = (Test-Path (Join-Path $checkpoint 'config.json')) -and (
  (Test-Path (Join-Path $checkpoint 'model.safetensors')) -or
  (Test-Path (Join-Path $checkpoint 'pytorch_model.bin'))
)
if (-not $checkpointReady) {
  throw 'Fine-tuned QA checkpoint is missing. Run the training command in ai_service/README.md.'
}

$ports = @(8000, 5000, 5173)
foreach ($port in $ports) {
  if (Test-NetConnection -ComputerName '127.0.0.1' -Port $port -InformationLevel Quiet) {
    throw "Port $port is already in use. Stop that specific service before using this launcher."
  }
}

New-Item -ItemType Directory -Force -Path $logs | Out-Null
$pythonProcess = Start-Process -FilePath $python `
  -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000') `
  -WorkingDirectory $aiService -PassThru `
  -RedirectStandardOutput (Join-Path $logs 'ai-service.log') `
  -RedirectStandardError (Join-Path $logs 'ai-service-error.log')
$backendProcess = Start-Process -FilePath 'node.exe' `
  -ArgumentList @('server.js') -WorkingDirectory $backend -PassThru `
  -RedirectStandardOutput (Join-Path $logs 'backend.log') `
  -RedirectStandardError (Join-Path $logs 'backend-error.log')
$frontendProcess = Start-Process -FilePath $env:ComSpec `
  -ArgumentList @('/c', 'npm.cmd run dev -- --host 127.0.0.1') `
  -WorkingDirectory $frontend -PassThru `
  -RedirectStandardOutput (Join-Path $logs 'frontend.log') `
  -RedirectStandardError (Join-Path $logs 'frontend-error.log')

Write-Output "AI Service PID $($pythonProcess.Id): http://127.0.0.1:8000"
Write-Output "Backend PID $($backendProcess.Id): http://127.0.0.1:5000"
Write-Output "Frontend PID $($frontendProcess.Id): http://127.0.0.1:5173"
Write-Output "Logs: $logs"
