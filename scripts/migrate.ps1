# Apply SQL migrations in packages/database/migrations via psql.
# Requires: SUPABASE_DB_URL (or DATABASE_URL)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$DbUrl = if ($env:SUPABASE_DB_URL) { $env:SUPABASE_DB_URL } else { $env:DATABASE_URL }

if (-not $DbUrl) {
  Write-Error 'SUPABASE_DB_URL (or DATABASE_URL) is required'
}

$files = Get-ChildItem -Path (Join-Path $Root 'packages/database/migrations') -Filter '*.sql' | Sort-Object Name
if (-not $files) {
  Write-Error 'No migration files found'
}

foreach ($file in $files) {
  Write-Host "Applying $($file.Name)..."
  & psql $DbUrl -v ON_ERROR_STOP=1 -f $file.FullName
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host 'Migrations complete.'
