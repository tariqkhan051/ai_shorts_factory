# Build and prepare the Next.js web app for deployment.
# Platform push (Vercel/etc.) remains operator-owned — this script validates + builds.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host 'Validating environment (non-production unless NODE_ENV=production)...'
node .\scripts\validate-env.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Building web workspace...'
pnpm build --filter=@ai-shorts-factory/web
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Web build complete. Deploy apps/web (.next) with your host of choice.'
Write-Host 'Health: GET /api/health   Ready: GET /api/ready'
