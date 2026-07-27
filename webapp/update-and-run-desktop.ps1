# Pulls latest master from GitHub, builds the Tauri desktop app (release), launches it.
[CmdletBinding()]
param(
    [string]$Branch = "master",
    [switch]$Force   # discard local changes and hard-reset to origin/$Branch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$webappDir = $PSScriptRoot
$repoRoot = (& git -C $webappDir rev-parse --show-toplevel).Trim()

Write-Host "== Checking working tree ==" -ForegroundColor Cyan
$dirty = & git -C $repoRoot status --porcelain
if ($dirty -and -not $Force) {
    Write-Host $dirty
    throw "Working tree has uncommitted changes. Commit/stash them, or re-run with -Force to discard local changes and hard-reset to origin/$Branch."
}

Write-Host "== Fetching origin ==" -ForegroundColor Cyan
& git -C $repoRoot fetch origin
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

& git -C $repoRoot checkout $Branch
if ($LASTEXITCODE -ne 0) { throw "git checkout $Branch failed" }

if ($Force) {
    Write-Host "== Hard reset to origin/$Branch (discarding local changes) ==" -ForegroundColor Yellow
    & git -C $repoRoot reset --hard "origin/$Branch"
    if ($LASTEXITCODE -ne 0) { throw "git reset --hard failed" }
    & git -C $repoRoot clean -fd
} else {
    Write-Host "== Fast-forwarding to origin/$Branch ==" -ForegroundColor Cyan
    & git -C $repoRoot merge --ff-only "origin/$Branch"
    if ($LASTEXITCODE -ne 0) { throw "Local $Branch has diverged from origin/$Branch. Resolve manually or re-run with -Force." }
}

Write-Host "== Installing dependencies ==" -ForegroundColor Cyan
Push-Location $webappDir
try {
    & npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

    Write-Host "== Building desktop app (release) ==" -ForegroundColor Cyan
    & cmd.exe /c "tauri-build.cmd"
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }
}
finally {
    Pop-Location
}

$exePath = Join-Path $webappDir "src-tauri\target\release\moex-portfolio-tracker.exe"
if (-not (Test-Path -LiteralPath $exePath)) {
    throw "Built executable not found: $exePath"
}

Write-Host "== Launching desktop app ==" -ForegroundColor Cyan
Start-Process -FilePath $exePath
