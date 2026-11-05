#!/usr/bin/env node
/**
 * Fail-closed env checks for deployment / production boots.
 * Usage: node scripts/validate-env.mjs [--production]
 */

const production =
  process.argv.includes('--production') || process.env.NODE_ENV === 'production';

const issues = [];

function requireEnv(name) {
  if (!process.env[name]) issues.push(`Missing required env: ${name}`);
}

if (production) {
  requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  requireEnv('SUPABASE_DB_URL');
  if ((process.env.PROJECT_STORE ?? 'supabase') === 'memory') {
    issues.push('PROJECT_STORE=memory is forbidden in production');
  }
  if (process.env.FLOW_PROVIDER && process.env.FLOW_PROVIDER !== 'mock') {
    if (process.env.FLOW_LIVE_ENABLED !== 'true' || process.env.FLOW_UI_VERIFIED !== 'true') {
      issues.push('Live Flow requires FLOW_LIVE_ENABLED=true and FLOW_UI_VERIFIED=true');
    }
  }
  if (process.env.STORAGE_PROVIDER === 'r2') {
    requireEnv('R2_ACCOUNT_ID');
    requireEnv('R2_ACCESS_KEY_ID');
    requireEnv('R2_SECRET_ACCESS_KEY');
    requireEnv('R2_BUCKET_NAME');
  }
}

// Dev-friendly warnings (non-fatal): Match Studio durable queue needs DB URL when postgres mode is selected.
if (
  (process.env.MATCH_JOB_QUEUE ?? '').toLowerCase() === 'postgres' &&
  !process.env.SUPABASE_DB_URL &&
  !process.env.DATABASE_URL
) {
  issues.push('MATCH_JOB_QUEUE=postgres requires SUPABASE_DB_URL (or DATABASE_URL)');
}

if (issues.length > 0) {
  console.error(JSON.stringify({ ok: false, issues }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, production, message: 'Environment validation passed' }));
