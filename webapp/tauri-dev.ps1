Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "tauri-dev.cmd"

if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Launcher script not found: $scriptPath"
}

& $scriptPath
exit $LASTEXITCODE
