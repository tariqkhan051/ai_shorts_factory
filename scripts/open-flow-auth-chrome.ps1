# Open Google Flow in real Chrome with the repo persistent profile.
# Manual sign-in only — no Generate automation, no credit spend.
param(
  [string]$ProfileDir = "D:\repos\personal\ai_shorts_factory\.flow-profile",
  [string]$Url = "https://flow.google.com/"
)

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
)

$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
  Write-Error "Google Chrome not found. Install Chrome or use Edge with --user-data-dir."
  exit 1
}

New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null
Write-Host "Launching Chrome for manual Flow sign-in..."
Write-Host "Profile: $ProfileDir"
Write-Host "URL: $Url"
Write-Host "Sign in manually. Do NOT click Generate. Reply in chat: workspace visible"

Start-Process -FilePath $chrome -ArgumentList @(
  "--user-data-dir=$ProfileDir",
  "--no-first-run",
  "--no-default-browser-check",
  $Url
)
