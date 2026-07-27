Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

$launchers = @(
  @{
    Path = Join-Path $PSScriptRoot "tauri-dev.ps1"
    ExpectedScript = "tauri-dev.cmd"
  }
  @{
    Path = Join-Path $PSScriptRoot "tauri-build.ps1"
    ExpectedScript = "tauri-build.cmd"
  }
)

foreach ($launcher in $launchers) {
  if (-not (Test-Path -LiteralPath $launcher.Path)) {
    throw "Missing launcher: $($launcher.Path)"
  }

  $content = Get-Content -LiteralPath $launcher.Path -Raw
  if ($content -notmatch [regex]::Escape($launcher.ExpectedScript)) {
    throw "Launcher $($launcher.Path) does not reference $($launcher.ExpectedScript)"
  }
}

$readmePath = Join-Path $repoRoot "README.md"
$readme = Get-Content -LiteralPath $readmePath -Raw
foreach ($scriptName in @("tauri-dev.ps1", "tauri-build.ps1")) {
  if ($readme -notmatch [regex]::Escape($scriptName)) {
    throw "README.md does not document $scriptName"
  }
}

Write-Host "Launcher smoke checks passed."
