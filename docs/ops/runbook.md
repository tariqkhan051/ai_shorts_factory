# Operations runbook

## Local / staging bootstrap

1. `pnpm install && pnpm build`
2. Copy `.env.example` → `apps/web/.env.local`
3. Keep `FLOW_PROVIDER=mock` unless live gates are verified
4. `pnpm dev:web` → open `/` and `/api/health`

## Database migrations

1. Set `SUPABASE_DB_URL` (Postgres connection string)
2. Apply in order via SQL editor **or**:
   - Windows: `pwsh -File ./scripts/migrate.ps1`
   - Unix: `bash ./scripts/migrate.sh`
3. Migrations live in `packages/database/migrations/` (`00001` → `00003`)

## Production deploy checklist

1. `NODE_ENV=production`
2. `PROJECT_STORE=supabase` + Supabase URL/anon/service role
3. Prefer `STORAGE_PROVIDER=r2` with full R2 credentials
4. `FLOW_PROVIDER=mock` unless `FLOW_LIVE_ENABLED=true` **and** `FLOW_UI_VERIFIED=true`
5. `node scripts/validate-env.mjs --production`
6. `pwsh -File ./scripts/deploy-web.ps1`
7. Probe `GET /api/health` (200) and `GET /api/ready` (200)
8. Optionally start workers with `scripts/deploy-workers.ps1` guidance

## Worker restart behavior

- Jobs are claimed with a lease (`WORKER_LEASE_SECONDS`, default 120s workers / 300s web ticks)
- Heartbeats extend the lease during processing
- If a worker dies, another worker may reclaim after `leaseExpiresAt`
- Covering tests: `packages/workflow-engine/src/worker-restart.test.ts`

## Credit uncertainty

- Known pre-submit failures → `releaseReservation`
- Uncertain Flow outcomes → `markUnknown` (never auto-refund)
- Manual fixes → `manualReconcile` / ledger compensating entries

## Google Flow human intervention

Stop and page a human when Playwright hits CAPTCHA, login walls, or unverified UI. Never invent Flow HTTP APIs. Never spend credits from CI.

Live canary procedure, browser auth, and credit reconciliation: `docs/ops/google-flow-setup.md`. Default canary is preflight-only (`FLOW_EXECUTE_LIVE` unset/false).

## Shared queue limitation

Web inline ticks and worker processes currently use **separate in-memory queues**. For multi-process production, implement a Postgres `JobQueue` using service-role RPCs before enabling keepalive workers against live traffic.
