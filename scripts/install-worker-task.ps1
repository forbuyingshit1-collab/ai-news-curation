$ErrorActionPreference = "Stop"

$taskName = "AI News Codex Worker"
$projectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$python = Join-Path $projectPath ".venv-worker-win\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
  throw "Worker virtual environment is missing. Run: python -m venv .venv-worker-win"
}
$runnerScript = Join-Path $projectPath "scripts\run-worker.ps1"
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask -and $existingTask.State -eq "Running") {
  Stop-ScheduledTask -TaskName $taskName
}

$action = New-ScheduledTaskAction `
  -Execute "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runnerScript`"" `
  -WorkingDirectory $projectPath

$triggers = @(
  New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  New-ScheduledTaskTrigger -Daily -At 8:00AM
)

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $triggers `
  -Settings $settings `
  -Principal $principal `
  -Description "Runs Gmail intake, source enrichment, Codex curation, and Thai Daily Editorial Boards." `
  -Force | Out-Null

Start-ScheduledTask -TaskName $taskName
Write-Output "Scheduled task '$taskName' installed and started."
