# Phase 0 — Repository Audit and Foundation

## Goals

- Inspect environment and empty repository
- Document architecture and blockers
- Initialize pnpm + Turborepo monorepo
- Ship a runnable Next.js dark studio shell
- Scaffold all required apps/packages
- Add env template, scripts, CI, and foundation tests

## Acceptance criteria

| Criterion                                 | Status |
| ----------------------------------------- | ------ |
| Architecture documentation                | Done   |
| pnpm workspaces + Turborepo               | Done   |
| Next.js App Router shell                  | Done   |
| TypeScript / lint / format / test tooling | Done   |
| `.env.example` + README                   | Done   |
| CI workflow                               | Done   |
| Mock provider contract (no live Flow)     | Done   |
| No paid API usage                         | Done   |

## Out of scope (deferred)

- Supabase migrations / Auth / RLS (Phase 1)
- ChatGPT prompt UX (Phase 2)
- Credit ledger + job queue (Phase 3)
- Google Flow Playwright automation (Phase 4)
- FFmpeg assembly (Phase 5)
- PWA notifications (Phase 6)

## Verification commands

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm dev:web
```

## Verification results (2026-11-04)

| Command             | Result                            |
| ------------------- | --------------------------------- |
| `pnpm install`      | Pass (after SWC download retry)   |
| `pnpm test`         | Pass (8 unit tests + scaffolds)   |
| `pnpm typecheck`    | Pass                              |
| `pnpm lint`         | Pass                              |
| `pnpm build`        | Pass (Next.js 15.5.29 + packages) |
| `pnpm format:check` | Pass                              |

## Next phase entry criteria

Phase 1 starts only after Phase 0 commands above pass and the web shell runs locally.

**Exact next step:** begin Phase 1 — Supabase integration, migrations, Auth, RLS, project CRUD, dashboard data wiring, and R2 storage abstraction. Do not start Flow automation.
