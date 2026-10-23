# Python writes recoverable source failures to stderr. Do not let Windows
# PowerShell treat those messages as fatal errors for the whole worker process.
$ErrorActionPreference = "Continue"
$projectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$python = Join-Path $projectPath ".venv-worker-win\Scripts\python.exe"
$log = Join-Path $projectPath ".secrets\worker.log"
Set-Location -LiteralPath $projectPath

# Keep the scheduled task alive if a native dependency or network call exits the
# Python worker unexpectedly. The worker itself handles ordinary job failures.
while ($true) {
  try {
    & $python "scripts\local-runner.py" --watch *>> $log
    $exitCode = $LASTEXITCODE
    Add-Content -LiteralPath $log -Value "Worker process exited with code $exitCode; restarting in 10 seconds."
  }
  catch {
    Add-Content -LiteralPath $log -Value "Worker launcher error: $($_.Exception.Message); restarting in 10 seconds."
  }
  Start-Sleep -Seconds 10
}
