# Phase 7 — Hardening and Deployment

## Goals

- Security + RLS audit with hardening migration
- Worker restart / lease reclaim + idempotency tests
- Storage lifecycle helpers
- Deployment scripts + env validation
- Operational docs + monitoring probes
- Structured logging for workers

## Delivered

| Item                                    | Location                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| Security headers (CSP, frame, nosniff)  | `apps/web/next.config.ts`                                                      |
| Health / ready probes                   | `apps/web/src/app/api/health`, `api/ready`                                     |
| RLS hardening migration                 | `packages/database/migrations/00003_phase7_hardening.sql`                      |
| Lease heartbeat + stable job keys       | `packages/workflow-engine`, web/worker process paths                           |
| Worker restart / reclaim tests          | `packages/workflow-engine/src/worker-restart.test.ts`                          |
| Storage prefix purge                    | `packages/storage/src/lifecycle.ts`                                            |
| Structured logger                       | `packages/shared-types/src/logger.ts`                                          |
| Env validation + deploy/migrate scripts | `scripts/*`                                                                    |
| Ops docs                                | `docs/ops/runbook.md`, `rls-audit.md`, `storage-lifecycle.md`, `monitoring.md` |

## Acceptance

- [x] Security headers on web responses
- [x] `/api/health` and `/api/ready` probes
- [x] RLS audit documented + migration applied in repo
- [x] Lease reclaim / heartbeat / double-submit idempotency tests
- [x] Storage purge helper + docs
- [x] Deploy + migrate scripts + `pnpm validate:env`
- [x] Ops runbook + monitoring notes
- [x] CI keeps `FLOW_PROVIDER=mock` (no live Flow credits)

## Known production scale follow-ups

Job queue, credit ledger, scene assets, and notifications remain **process-local memory** for generation paths even when `PROJECT_STORE=supabase`. A shared Postgres queue + service-role worker clients are the next scale step (documented in the runbook) — not required to close Phase 7 hardening gates for mock/local deploy tooling.

## Verification results

| Command             | Result |
| ------------------- | ------ |
| `pnpm test`         | Pass   |
| `pnpm typecheck`    | Pass   |
| `pnpm lint`         | Pass   |
| `pnpm build`        | Pass   |
| `pnpm format:check` | Pass   |

## Exact next step

Operate via `docs/ops/runbook.md`. Optionally implement a shared Supabase-backed `JobQueue` so `flow-worker` / `media-worker` consume the same jobs as the web app.
