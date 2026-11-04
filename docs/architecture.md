# AI Shorts Factory — Architecture

**Phase:** 6 — Realtime Dashboard and Notifications  
**Status:** SSE live dashboard, in-app alerts, PWA shell, optional web push  
**Last updated:** 2026-11-04

## 1. Architecture assessment

### Repository state (audit)

| Item                            | Finding                                                           |
| ------------------------------- | ----------------------------------------------------------------- |
| Existing code                   | Empty greenfield directory                                        |
| Git                             | Initialized during Phase 0                                        |
| Node.js                         | v24.12.0 available (engines require ≥20)                          |
| pnpm                            | Installed (9.15.0); corepack system enable blocked by permissions |
| Turborepo                       | Installed as workspace root dependency                            |
| FFmpeg / FFprobe                | Present (`FFMPEG_PATH` / `FFPROBE_PATH` set)                      |
| Playwright                      | Available via npx (1.64.x) — used later, Phase 4                  |
| Python / Blender / local GPU AI | Not used by design                                                |

### Architectural stance

AI Shorts Factory is a **modular monolith** for the Next.js application backend, with **independent worker processes** for Google Flow automation and FFmpeg media assembly.

- Frontend stays lightweight; business logic lives in packages and server routes.
- Cloud services (Supabase, R2, workers) are behind interfaces so infrastructure can be replaced.
- Google Flow integration is browser automation behind `VideoGenerationProvider`. There is **no assumed official Flow API**.
- Default provider in development/CI is `MockVideoGenerationProvider`. Live automation is **not production-ready** until Phase 4 verification.
- Story writing uses the free ChatGPT website via copyable prompts + JSON import — **no paid ChatGPT API**.

### Category-agnostic design

Projects are parameterized by content category and visual style. Pipelines, credits, and assembly do not hard-code a single niche (anime-only, gaming-only, etc.).

## 2. Proposed repository structure

```text
ai_shorts_factory/
├── apps/
│   ├── web/                 # Next.js App Router UI + modular monolith API
│   ├── flow-worker/         # Playwright / mock generation worker
│   └── media-worker/        # FFmpeg assembly + quality gates
├── packages/
│   ├── shared-types/        # Domain constants, workflow & scene states
│   ├── validation/          # Zod schemas (screenplay v1+)
│   ├── database/            # Supabase access (Phase 1+)
│   ├── workflow-engine/     # State machine + job queue (Phase 3+)
│   ├── credit-manager/      # Ledger / reservations (Phase 3+)
│   ├── storage/             # R2 abstraction (Phase 1+)
│   ├── notification/        # PWA + persisted notifications (Phase 6+)
│   ├── chatgpt-import/      # Prompt builder + import normalize (Phase 2+)
│   ├── flow-adapter/        # VideoGenerationProvider + mock (+ Playwright later)
│   └── media-engine/        # FFmpeg/ffprobe helpers (Phase 5+)
├── docs/                    # Architecture & phase notes
├── .github/workflows/ci.yml
├── .env.example
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## 3. Runtime topology

```text
Browser (PWA)
    │
    ▼
apps/web  ──► Supabase Auth / Postgres / Realtime
    │              │
    │              ▼
    │         Cloudflare R2 (signed URLs)
    │
    ├──► PostgreSQL job tables (claimed by workers)
    │
    ├──► apps/flow-worker  ──► Mock | Google Flow (Playwright)
    │
    └──► apps/media-worker ──► FFmpeg / FFprobe ──► R2 final MP4
```

Workers never run generation or FFmpeg inside HTTP request handlers.

## 4. Core domain rules (fixed)

| Rule                               | Default                                        |
| ---------------------------------- | ---------------------------------------------- |
| Daily Flow credit budget           | 50                                             |
| Scenes per project                 | 5                                              |
| Cost per scene (expected)          | 10 credits                                     |
| Generations per video              | 5                                              |
| Max final duration                 | 59s (target ~30–40s)                           |
| Default model                      | Veo 3.1 - Lite (configurable via `DEFAULT_GENERATION_MODEL` / `FLOW_MODEL_OPTION_LABEL`; verify in UI) |
| Default clip duration / resolution | 8s / 720p (Veo 3.1 - Lite Scenes pill; configurable) |
| Generation order                   | Sequential; no auto-replacement                |
| Publishing                         | Download/review only initially                 |

## 5. Workflow states

Canonical states live in `@ai-shorts-factory/shared-types` (`WORKFLOW_STATES`). Transitions must be persisted, timestamped, auditable, idempotent, and event-emitting (Phase 3).

Scene states: `PENDING | GENERATING | DOWNLOADING | VERIFYING | COMPLETED | FAILED | NEEDS_ATTENTION`.

## 6. Provider contract

`VideoGenerationProvider` (`packages/flow-adapter`) exposes:

- `checkAvailability`, `validateConfiguration`, `prepareSession`
- `submitGeneration`, `getGenerationStatus`, `waitForCompletion`
- `downloadAsset`, `getObservedCreditCost`

Implementations:

| Provider                       | Phase | Status                                                 |
| ------------------------------ | ----- | ------------------------------------------------------ |
| `MockVideoGenerationProvider`  | 0     | Implemented for dev/tests                              |
| `GoogleFlowPlaywrightProvider` | 4–7   | Implemented; canary-gated live UI automation           |

Security constraints for live Flow:

- No password storage; encrypted browser profile only
- Stop on CAPTCHA / verification / auth expiry
- No silent uncertain retries
- Never expose cookies/session via APIs

## 7. Credit ledger principles

Transactional reservations; immutable ledger entries; compensating corrections; unknown consumption when cost cannot be confirmed; manual reconciliation; timezone default `Asia/Karachi` without assuming Google’s refresh instant.

## 8. Phased delivery

| Phase | Deliverable                                           |
| ----- | ----------------------------------------------------- |
| **0** | Monorepo, web shell, docs, CI, mock provider contract |
| 1     | Supabase, RLS, project CRUD, storage abstraction      |
| 2     | ChatGPT story studio, import, characters, approval    |
| 3     | Credits + mock sequential generation + job queue      |
| 4     | Verified single-scene Google Flow automation          |
| 5     | FFmpeg assembly under 59s                             |
| 6     | Realtime dashboard + PWA notifications ✅             |
| 7     | Hardening + deployment ✅                             |

**Do not start the next phase until the current phase passes acceptance criteria.**

## 9. Environment variables

See root `.env.example`. Critical categories:

- Supabase URL / anon / service role (server-only for service role)
- R2 credentials (server-only)
- Worker enable flags and auth token
- `FLOW_PROVIDER=mock` for local/CI
- FFmpeg paths
- Credit and video defaults

## 10. Technical blockers / risks

1. **Google Flow automation permission & UI stability** — may force permanent manual handoff mode.
2. **Model / cost availability** — never assume; verify in UI before submit.
3. **Credit refresh timing** — Google’s reset may not match `Asia/Karachi` midnight.
4. **Upscaling honesty** — 720p sources must not be labeled as native 1080p generation.
5. **CAPTCHA / session expiry** — requires human intervention paths.
6. **No Redis/Kafka/K8s yet** — Postgres job queue first; revisit only with demonstrated need.
7. **pnpm via corepack** — system enable may need admin; global npm install of pnpm works as fallback.

## 11. Phase 0 acceptance

- [x] Architecture documented
- [x] pnpm workspaces + Turborepo
- [x] Next.js App Router web shell (dark creative-studio aesthetic)
- [x] TypeScript strict base config
- [x] Lint / format / test / CI scaffolding
- [x] `.env.example` and local scripts
- [x] Package scaffolds for all required modules
- [x] Mock provider contract (no live Flow, no paid APIs)
