$ErrorActionPreference = "Stop"
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

$values = @{}
foreach ($line in Get-Content -LiteralPath ".env.local") {
  if ($line -match "^([A-Z][A-Z0-9_]*)=(.*)$") {
    $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
  }
}

foreach ($name in @("APP_PASSWORD_HASH", "SESSION_SECRET", "WORKER_TOKEN")) {
  if (-not $values.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($values[$name])) {
    throw "$name is missing from .env.local"
  }
  & vercel.cmd env add $name production --force --sensitive --yes --value $values[$name]
  if ($LASTEXITCODE -ne 0) { throw "Failed to configure $name" }
}

Write-Output "Production auth variables are configured."
