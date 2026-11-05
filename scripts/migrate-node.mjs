#!/usr/bin/env node
/**
 * Apply packages/database/migrations via `pg` (no psql required).
 * Reads SUPABASE_DB_URL / DATABASE_URL from env or apps/web/.env.local.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1);
    if (!(key in process.env) || !process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.join(root, 'apps/web/.env.local'));
loadEnvFile(path.join(root, '.env.local'));

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('SUPABASE_DB_URL (or DATABASE_URL) is required');
  process.exit(1);
}

const pgModulePath = path.join(root, 'node_modules/.pnpm/pg@8.23.1/node_modules/pg/lib/index.js');
const pg = (await import(pathToFileURL(pgModulePath).href)).default;

const dir = path.join(root, 'packages/database/migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query(`
  create table if not exists public.schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  )
`);

const done = new Set(
  (await client.query('select filename from public.schema_migrations')).rows.map((r) => r.filename),
);

for (const file of files) {
  if (done.has(file)) {
    console.log('SKIP', file);
    continue;
  }
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  process.stdout.write(`APPLY ${file}...`);
  try {
    await client.query(sql);
    await client.query('insert into public.schema_migrations(filename) values ($1) on conflict do nothing', [
      file,
    ]);
    console.log(' OK');
  } catch (err) {
    console.log(' FAIL');
    console.error(String(err.message || err).slice(0, 500));
    if (err.position) {
      const p = Number(err.position);
      console.error('ctx', JSON.stringify(sql.slice(Math.max(0, p - 80), p + 80)));
    }
    await client.end();
    process.exit(1);
  }
}

const applied = (await client.query('select filename from public.schema_migrations order by 1')).rows;
console.log('APPLIED_COUNT', applied.length);
await client.end();
