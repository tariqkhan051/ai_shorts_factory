#!/usr/bin/env node
/**
 * Prints migration apply instructions. Actual SQL execution needs psql + SUPABASE_DB_URL.
 * Cross-platform entry for `pnpm db:migrate`.
 */
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'packages/database/migrations');
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

console.log(
  JSON.stringify(
    {
      migrations: files,
      apply:
        process.platform === 'win32'
          ? 'pwsh -File ./scripts/migrate.ps1'
          : 'bash ./scripts/migrate.sh',
      requires: ['SUPABASE_DB_URL or DATABASE_URL', 'psql'],
    },
    null,
    2,
  ),
);

if (!process.env.SUPABASE_DB_URL && !process.env.DATABASE_URL) {
  console.error('Set SUPABASE_DB_URL to apply migrations with the platform script.');
  process.exitCode = 0;
}
