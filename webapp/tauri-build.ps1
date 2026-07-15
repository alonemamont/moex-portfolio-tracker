Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "tauri-build.cmd"

if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Launcher script not found: $scriptPath"
}

& $scriptPath
exit $LASTEXITCODE
