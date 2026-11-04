#!/usr/bin/env bash
# Apply SQL migrations in packages/database/migrations via psql.
# Requires: SUPABASE_DB_URL (or DATABASE_URL)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_URL="${SUPABASE_DB_URL:-${DATABASE_URL:-}}"

if [[ -z "$DB_URL" ]]; then
  echo "SUPABASE_DB_URL (or DATABASE_URL) is required" >&2
  exit 1
fi

shopt -s nullglob
files=("$ROOT"/packages/database/migrations/*.sql)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "No migration files found" >&2
  exit 1
fi

for file in "${files[@]}"; do
  echo "Applying $(basename "$file")..."
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$file"
done

echo "Migrations complete."
