# Phase 4 — Verified Single-Scene Google Flow

## Goals

- Playwright provider behind `VideoGenerationProvider` (no invented Flow HTTP APIs)
- Hard live gates: provider, `FLOW_LIVE_ENABLED`, `FLOW_UI_VERIFIED`, profile dir, verified recipe
- Stop on CAPTCHA / login for human intervention + diagnostic screenshots
- Operator single-scene verify CLI
- CI remains `FLOW_PROVIDER=mock` only
- Web mock generation unchanged as the default product path

## Delivered

| Item                             | Location                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| UI recipe + verification helpers | `packages/flow-adapter/src/flow-ui-recipe.ts`                                           |
| Live gates                       | `packages/flow-adapter/src/flow-live-gates.ts`                                          |
| Playwright session + provider    | `packages/flow-adapter/src/playwright-session.ts`, `google-flow-playwright-provider.ts` |
| Provider factory                 | `packages/flow-adapter/src/create-provider.ts`                                          |
| Unverified recipe template       | `packages/flow-adapter/recipes/google-flow.unverified.json`                             |
| Single-scene verify CLI          | `apps/flow-worker` → `verify:scene`                                                     |
| Settings gate status             | `apps/web/src/app/settings`                                                             |

## Operator verification checklist

1. Open Google Flow in a real browser with a normal Google session.
2. Confirm automation is permitted for your account / workspace policy.
3. Inspect the UI and fill every required selector in the recipe JSON (`promptInput`, model/duration/resolution controls, submit, result ready, download). Optionally set captcha/login selectors.
4. Set `verifiedAt` / `verifiedBy` on the recipe and `FLOW_UI_VERIFIED=true`.
5. Point `FLOW_BROWSER_PROFILE_DIR` at a persistent Chromium profile (sign in interactively once if needed — never store passwords in env).
6. Install browser: `pnpm exec playwright install chromium`
7. Run:

```bash
FLOW_PROVIDER=playwright \
FLOW_LIVE_ENABLED=true \
FLOW_UI_VERIFIED=true \
FLOW_BROWSER_PROFILE_DIR=./.flow-profile \
FLOW_UI_RECIPE_PATH=path/to/verified-recipe.json \
FLOW_HEADLESS=false \
pnpm --filter @ai-shorts-factory/flow-worker verify:scene
```

8. On CAPTCHA or login wall, automation stops with `needs_human_intervention` and a diagnostic screenshot.

## Acceptance

- [x] `GoogleFlowPlaywrightProvider` implements the provider contract via browser UI only
- [x] Live gates block CI / default mock paths
- [x] Unverified recipe cannot submit
- [x] CAPTCHA / login detection returns human intervention
- [x] Single-scene verify CLI
- [x] Unit tests use injected fake browser session (no live Google in CI)
- [x] Settings shows gate status

## Verification results

| Command             | Result |
| ------------------- | ------ |
| `pnpm test`         | Pass   |
| `pnpm typecheck`    | Pass   |
| `pnpm lint`         | Pass   |
| `pnpm build`        | Pass   |
| `pnpm format:check` | Pass   |

## Exact next step

Phase 5 — FFmpeg assembly under 59s (see `phase-5.md`). Live multi-scene Flow remains operator-gated.
