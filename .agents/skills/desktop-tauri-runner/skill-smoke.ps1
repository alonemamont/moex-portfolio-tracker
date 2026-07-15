Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$skillPath = Join-Path $PSScriptRoot "SKILL.md"
$agentPath = Join-Path $PSScriptRoot "agents/openai.yaml"

$skill = Get-Content -LiteralPath $skillPath -Raw
$agent = Get-Content -LiteralPath $agentPath -Raw

$requiredSkillPatterns = @(
  "tauri-dev.ps1",
  "tauri-build.ps1",
  "PowerShell",
  "Codex",
  "EBUSY",
  "os error 5"
)

foreach ($pattern in $requiredSkillPatterns) {
  if ($skill -notmatch [regex]::Escape($pattern)) {
    throw "SKILL.md missing pattern: $pattern"
  }
}

$requiredAgentPatterns = @(
  "PowerShell",
  "Tauri"
)

foreach ($pattern in $requiredAgentPatterns) {
  if ($agent -notmatch [regex]::Escape($pattern)) {
    throw "openai.yaml missing pattern: $pattern"
  }
}

Write-Host "Skill smoke checks passed."
