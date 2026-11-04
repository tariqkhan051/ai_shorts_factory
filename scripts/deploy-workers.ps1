# Build worker packages for process hosts (VM, container, or pm2).
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host 'Building flow-worker and media-worker...'
pnpm build --filter=@ai-shorts-factory/flow-worker --filter=@ai-shorts-factory/media-worker
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host @'
Workers built.
Start (mock / smoke — never spend Flow credits in CI):
  FLOW_WORKER_ENABLED=true FLOW_PROVIDER=mock FLOW_WORKER_SMOKE=true pnpm --filter @ai-shorts-factory/flow-worker start
  MEDIA_WORKER_ENABLED=true MEDIA_WORKER_SMOKE=true pnpm --filter @ai-shorts-factory/media-worker start

Keepalive production loop (shared Postgres queue still pending):
  FLOW_WORKER_ENABLED=true FLOW_WORKER_KEEPALIVE=true FLOW_PROVIDER=mock pnpm --filter @ai-shorts-factory/flow-worker start
'@
