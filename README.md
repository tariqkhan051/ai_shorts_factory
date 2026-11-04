# AI Shorts Factory

Cloud-based short video production platform: idea → ChatGPT screenplay import → sequential scene generation → FFmpeg assembly → reviewed MP4 download.

**Current phase: 5 — FFmpeg Assembly**

This is a real application under phased construction. Paid APIs are **not** enabled. Story writing uses a copyable ChatGPT website prompt + JSON import. Product generation defaults to the mock provider; assembly uses FFmpeg toward a ≤59s vertical MP4. Live Google Flow is Playwright UI automation only, hard-gated until an operator verifies selectors.

## Stack

| Layer                     | Choice                                                      |
| ------------------------- | ----------------------------------------------------------- |
| Web                       | Next.js (App Router), TypeScript, Tailwind                  |
| Monorepo                  | pnpm workspaces + Turborepo                                 |
| Data (Phase 1+)           | Supabase Postgres + Auth + Realtime                         |
| Object storage (Phase 1+) | Cloudflare R2                                               |
| Generation                | Provider interface → Mock (now) / Playwright Flow (Phase 4) |
| Media (Phase 5+)          | FFmpeg / FFprobe on media-worker                            |
| Validation                | Zod                                                         |

## Repository layout

```text
apps/web            Next.js UI + modular monolith API surface
apps/flow-worker    Generation worker (mock now; Flow later)
apps/media-worker   Assembly / QC worker
packages/*          Domain modules (types, validation, credits, …)
docs/architecture.md
```

## Prerequisites

- Node.js ≥ 20 (`nvm` / `.nvmrc`)
- pnpm ≥ 9 (`npm install -g pnpm@9.15.0` if corepack is blocked)
- FFmpeg + FFprobe (needed from Phase 5; already useful for local tooling)
- Supabase project (Phase 1+)
- Cloudflare R2 bucket (Phase 1+)
- Google account for Flow (Phase 4 only; never store passwords)

## Quick start

```bash
pnpm install
cp .env.example apps/web/.env.local
pnpm build
pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000).

Default local mode uses an in-memory project store (`PROJECT_STORE=memory`) so you can create/edit projects without Supabase. For Supabase:

1. Apply `packages/database/migrations/00001_init.sql`
2. Set `PROJECT_STORE=supabase` plus the public Supabase URL/anon key
3. Sign up at `/signup`

Other scripts:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Workers stay off unless explicitly enabled. Memory queues are process-local; the web **Start mock generation** button processes jobs inline. Smoke the worker loop with:

```bash
FLOW_WORKER_ENABLED=true FLOW_WORKER_SMOKE=true FLOW_PROVIDER=mock pnpm --filter @ai-shorts-factory/flow-worker start
```

After filling a verified Flow UI recipe (see `docs/phases/phase-4.md`):

```bash
pnpm exec playwright install chromium
FLOW_PROVIDER=playwright FLOW_LIVE_ENABLED=true FLOW_UI_VERIFIED=true \
  FLOW_BROWSER_PROFILE_DIR=./.flow-profile FLOW_UI_RECIPE_PATH=./path/to/recipe.json \
  pnpm --filter @ai-shorts-factory/flow-worker verify:scene
```

FFmpeg smoke assembly:

```bash
MEDIA_WORKER_ENABLED=true MEDIA_WORKER_SMOKE=true pnpm --filter @ai-shorts-factory/media-worker start
```

## Environment

Copy `.env.example`. Never commit secrets. Never expose:

- Supabase service-role key
- R2 secret keys
- Google session cookies / browser profiles
- Worker auth tokens

## Business defaults

- Daily Flow budget: **50** credits
- Exactly **5** scenes / project
- **10** credits per scene (expected)
- Max final duration: **59** seconds
- Sequential generation; no automatic replacements
- Default model config: Gemini Omni Flash / 6s / 720p (must be verified in Flow UI before live use)

## Phase roadmap

See [docs/architecture.md](./docs/architecture.md) and [docs/phases/](./docs/phases/).

| Phase | Focus                                                |
| ----- | ---------------------------------------------------- |
| 0     | Monorepo, shell, docs, CI, mock provider contract ✅ |
| 1     | Database, auth, RLS, projects, storage ✅            |
| 2     | ChatGPT story studio ✅                              |
| 3     | Credits + mock sequential generation ✅              |
| 4     | Verified single-scene Google Flow ✅                 |
| 5     | FFmpeg assembly ✅                                   |
| 6     | Realtime dashboard + notifications                   |
| 7     | Hardening + deployment                               |

## Safety rules

- No local GPU / local AI models / Blender / local render farms
- No paid ChatGPT API; manual ChatGPT website + JSON import
- No invented Flow HTTP APIs
- No CAPTCHA bypass; auth expiry → human intervention
- CI and automated tests must use `FLOW_PROVIDER=mock` only
