# Phase 3 — Credit Engine and Mock Flow

## Goals

- Immutable credit ledger with reserve / confirm / unknown / release
- Sequential mock scene generation (exactly 5 × 10 credits)
- Job queue with leases and idempotency keys
- No automatic retries or scene replacements
- Pause + manual retry on failure
- Flow worker claim/complete loop (memory queue; Postgres later)

## Delivered

| Item                              | Location                                        |
| --------------------------------- | ----------------------------------------------- |
| Credit ledger                     | `packages/credit-manager`                       |
| Job queue + sequential runner     | `packages/workflow-engine`                      |
| Workflow transitions (generation) | `packages/database/src/workflow-transitions.ts` |
| App bridge store + runtime        | `apps/web/src/lib/generation`                   |
| Generation UI                     | `apps/web/src/app/projects/[id]/generate`       |
| Flow worker claim loop            | `apps/flow-worker`                              |

## Local flow

1. `pnpm build && pnpm dev:web`
2. Create a project → Story Studio → load sample → approve
3. Open **Scene generation** → **Start mock generation**
4. Watch five scenes complete; credits spend 50; workflow → `ASSEMBLY_READY`
5. Optional smoke worker:  
   `FLOW_WORKER_ENABLED=true FLOW_WORKER_SMOKE=true FLOW_PROVIDER=mock pnpm --filter @ai-shorts-factory/flow-worker start`

Memory-mode queues are process-local. The web app processes enqueued jobs with an inline worker tick after Start/Retry. The flow-worker loop uses the same claim/complete APIs against its own process queue (and a shared Postgres queue later).

## Acceptance

- [x] Daily budget default 50; 10 credits reserved per scene
- [x] Sequential generation; completed scenes never regenerated
- [x] Failure pauses project; manual retry only
- [x] Uncertain post-submit failures mark credits unknown
- [x] Mock provider only (no live Flow / no invented APIs)
- [x] Generation UI: start, scene states, credits, retry
- [x] Flow-worker lease loop + smoke path

## Verification results

| Command             | Result |
| ------------------- | ------ |
| `pnpm test`         | Pass   |
| `pnpm typecheck`    | Pass   |
| `pnpm lint`         | Pass   |
| `pnpm build`        | Pass   |
| `pnpm format:check` | Pass   |

## Exact next step

Phase 4 — Verified single-scene Google Flow via Playwright after UI confirmation (see `phase-4.md`).
