# Phase 7 addendum — Real Google Flow canary (Scene 1)

## Goals

- Production-minded Playwright integration (no invented Flow APIs)
- Session status on the dashboard
- One-scene canary with explicit spend confirmation
- Duplicate-submission protection + unknown credit handling
- Mock path unchanged; CI never spends Flow credits

## Delivered

| Item | Location |
| ---- | -------- |
| Live config + canary gates | `packages/flow-adapter/src/flow-live-config.ts` |
| Session status | `packages/flow-adapter/src/flow-session-status.ts` |
| Spend confirmation | `packages/flow-adapter/src/spend-confirmation.ts` |
| Provider hardening | `packages/flow-adapter/src/google-flow-playwright-provider.ts` |
| Runner: SUBMITTING / UNKNOWN_SUBMISSION / verify | `packages/workflow-engine/src/sequential-generation-runner.ts` |
| Canary CLI (preflight default) | `apps/flow-worker/src/canary-scene.ts` |
| Flow Integration + canary UI | `apps/web` generate page |
| Ops guide | `docs/ops/google-flow-setup.md` |

## STOP condition

Canary implementation is ready. **Do not run live generation automatically.** Present the preflight report and wait for explicit operator approval (`SPEND_REAL_CREDITS` + `FLOW_EXECUTE_LIVE=true`) before spending real Google Flow credits.

## Unlock five-scene live (after canary review)

```bash
FLOW_CANARY_ONLY=false
FLOW_MAX_LIVE_SCENES_PER_PROJECT=5
```
