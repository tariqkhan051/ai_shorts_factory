# SYSTEM FILE MAP

Most important source files for understanding and extending AI Shorts Factory. Paths are relative to repository root `D:\repos\personal\ai_shorts_factory`.

---

## Root / ops

| Path | Role |
|---|---|
| `package.json` | Monorepo scripts (dev, test, match CLIs, deploy) |
| `pnpm-workspace.yaml` | `apps/*`, `packages/*` |
| `turbo.json` | Build/test pipeline graph |
| `.env.example` | Canonical env var names (no secrets) |
| `.nvmrc` | Node 20 |
| `.github/workflows/ci.yml` | format, lint, typecheck, test (mock Flow), audit, build |
| `README.md` | Operator overview; verify against code |
| `docs/architecture.md` | Intended architecture (cross-check with this audit) |
| `MLBB_INTEGRATION_AUDIT.md` | Prior MLBB audit + milestones 1–7 notes |
| `docker/n8n/docker-compose.yml` | Optional n8n 1.72.1 |
| `scripts/*.mjs` | Env validate, Flow inspect, live canary, MLBB CLIs |
| `assets/game-knowledge/*.sample.json` | Sample KB import payloads |

---

## Apps — web (`apps/web`)

### Entry / auth

| Path | Classes / functions | Notes |
|---|---|---|
| `src/middleware.ts` | Supabase session refresh | Does not globally auth-gate |
| `src/lib/auth.ts` | `getCurrentUser`, `requireUser` | Memory vs Supabase |
| `src/lib/env.ts` | `getAppEnv` | Store/R2 readiness |
| `src/lib/supabase/{server,client,middleware,env}.ts` | SSR/browser clients | |
| `src/app/auth/callback/route.ts` | OAuth code exchange | |

### App shell / pages

| Path | Purpose |
|---|---|
| `src/components/app-shell.tsx` | Nav: Dashboard, Brands, Projects, Social, Characters, Game KB, Match OCR, Settings |
| `src/app/page.tsx` | Dashboard |
| `src/app/login/page.tsx`, `signup/page.tsx` | Auth forms |
| `src/app/projects/**` | Project lifecycle UI |
| `src/app/brands/page.tsx` | Brands |
| `src/app/characters/page.tsx` | Global character library |
| `src/app/social-accounts/page.tsx` | Registered social accounts |
| `src/app/game-knowledge/page.tsx` | KB import/publish UI |
| `src/app/match-analysis/page.tsx` | CLI documentation hub (not full pipeline UI) |
| `src/app/library/page.tsx` | Placeholder |
| `src/app/settings/page.tsx` | Settings |

### Server actions (mutations)

| Path | Key exports |
|---|---|
| `src/app/projects/actions.ts` | `createProjectAction`, `updateProjectAction`, `deleteProjectAction` |
| `src/app/projects/[id]/story/actions.ts` | Import/approve/edit screenplay |
| `src/app/projects/[id]/dna/actions.ts` | Publish DNA |
| `src/app/projects/[id]/generate/actions.ts` | `startMockGenerationAction`, live canary preflight/confirm |
| `src/app/projects/[id]/flow-package/actions.ts` | Manual Flow package + uploads |
| `src/app/projects/[id]/assemble/actions.ts` | `startAssemblyAction` |
| `src/app/projects/[id]/automation/actions.ts` | n8n orchestration controls |
| `src/app/projects/[id]/videos/[videoId]/distribution/actions.ts` | `createDistributionAction`, `confirmManualPublishAction` |
| `src/app/game-knowledge` actions (forms) | Import/publish KB |

### API routes

| Path | Methods | Role |
|---|---|---|
| `src/app/api/health/route.ts` | GET | Liveness |
| `src/app/api/ready/route.ts` | GET | Readiness gates |
| `src/app/api/projects/[id]/generate/route.ts` | POST | Enqueue + tick generation |
| `src/app/api/projects/[id]/assemble/route.ts` | POST | Enqueue + tick assembly |
| `src/app/api/projects/[id]/assembly/route.ts` | GET | Assembly metadata |
| `src/app/api/projects/[id]/assembly/video/route.ts` | GET | Stream MP4 |
| `src/app/api/projects/[id]/assembly/publishing/route.ts` | GET | Publishing pack |
| `src/app/api/projects/[id]/flow-package/manifest/route.ts` | GET | Manifest download |
| `src/app/api/projects/[id]/scenes/[sceneId]/video/route.ts` | GET | Scene asset |
| `src/app/api/references/[assetId]/route.ts` | GET | Reference asset |
| `src/app/api/notifications/route.ts` | GET, PATCH | Notifications |
| `src/app/api/notifications/stream/route.ts` | GET SSE | Live hub |
| `src/app/api/push/*` | GET/POST/DELETE | VAPID + subscribe |
| `src/app/api/n8n/*` | GET/POST | n8n health/status/retry |

### Generation / assembly runtime

| Path | Key symbols | Lines / notes |
|---|---|---|
| `src/lib/generation/runtime.ts` | `getJobQueue`, `getCreditLedger`, `createGenerationRunner` | Always mock provider |
| `src/lib/generation/process-job.ts` | `processNextGenerationJob` | Claims queue; routes job types |
| `src/lib/generation/app-generation-store.ts` | `AppGenerationStore` | Snapshot + story approval gate |
| `src/lib/generation/assemble-project.ts` | `assembleProjectForUser` | Workflow → FFmpeg → notifications/n8n |
| `src/lib/generation/assembly-gate.ts` | `evaluateAssemblyGate` | Mock vs real provenance |
| `src/lib/generation/manual-import.ts` | `importManualSceneVideo` | Media contract + storage |
| `src/lib/projects/prompt-context.ts` | `buildPromptContext` | DNA + libraries → prompt |
| `src/lib/projects/repository.ts` | Repo getters + memory persist | Dual store wiring |
| `src/lib/assembly/publishing-pack.ts` | Publishing text/json builder | |
| `src/lib/characters/reference-image.ts` | Upload validation (15 MiB) | |

---

## Apps — workers

| Path | Key symbols | Notes |
|---|---|---|
| `apps/flow-worker/src/index.ts` | `main`, `processClaimedJob`, `liveRunnerOptions` | Live/mock generation claim loop |
| `apps/flow-worker/src/canary-scene.ts` | Scene 1 canary | |
| `apps/flow-worker/src/verify-scene.ts` | Single-scene verify | |
| `apps/flow-worker/src/auth-session.ts` | Headed Google sign-in profile | |
| `apps/media-worker/src/index.ts` | `main` | FFmpeg smoke; fails real assemble jobs |

---

## Packages — database

| Path | Role |
|---|---|
| `migrations/00001_init.sql` | Core tables + enums + RLS seed |
| `migrations/00002_notifications.sql` | Push subscriptions |
| `migrations/00003_phase7_hardening.sql` | RLS tightening |
| `migrations/00004_live_flow_scene_states.sql` | Extra scene states |
| `migrations/00005_character_bible.sql` | Character versions / library |
| `migrations/00006_captions_on_video.sql` | Captions flag |
| `migrations/00007_content_platform.sql` | Brands, DNA, videos, environments, social, distributions |
| `migrations/00008_game_knowledge.sql` | Game profiles/patches/heroes |
| `migrations/00009_match_analysis.sql` | Match sources + analysis jobs |
| `migrations/00010_match_event_timeline.sql` | Timelines + events |
| `migrations/00011_match_edit.sql` | Edit plans + renders |
| `migrations/00012_kb_sync_and_spend.sql` | KB sync + spend artifacts |
| `src/workflow-transitions.ts` | `canTransition`, `assertTransition`, `planTransitionPath` |
| `src/content-platform-service.ts` | Brand/project/video/DNA orchestration |
| `src/dna-helpers.ts` | `dnaSnapshotFromProject`, `videoContextFromDna` |
| `src/sync-characters-from-screenplay.ts` | Character sync rules |
| `src/game-knowledge-*.ts` | Import, activation, publish |
| `src/match-analysis-pipeline.ts` | `ingestMatchVideo`, roster analysis |
| `src/match-event-pipeline.ts` | Timeline analysis |
| `src/match-commentary-service.ts` | `generateGroundedMatchCommentary` |
| `src/match-edit-pipeline.ts` | `assembleMatchEditFromTimeline` |
| `src/match-edit-plan.ts` | `buildMatchEditPlan` |
| `src/match-edit-approve.ts` | Distribution approval phrase |
| `src/match-spend.ts` | Paid vision/TTS gates |
| `src/kb-artifact-sync.ts` | Non-publishing artifact pull |
| `src/*-repository.ts` | Memory + Supabase dual implementations |
| `src/index.ts` | Public package exports |

---

## Packages — workflow-engine

| Path | Key symbols |
|---|---|
| `src/job-types.ts` | `WORKFLOW_JOB_TYPES`, job states |
| `src/memory-job-queue.ts` | `MemoryJobQueue` enqueue/claim/complete/fail |
| `src/sequential-generation-runner.ts` | `SequentialGenerationRunner.runProject`, `retryScene`, `runScene` |
| `src/live-generation-lock.ts` | Cross-process live slot |
| `src/index.ts` | Package barrel |

---

## Packages — flow-adapter

| Path | Key symbols |
|---|---|
| `src/create-provider.ts` | `createVideoGenerationProvider` |
| `src/mock-provider.ts` | `MockVideoGenerationProvider` |
| `src/google-flow-manual-provider.ts` | HITL provider |
| `src/google-flow-playwright-provider.ts` | Live UI automation |
| `src/flow-live-gates.ts` | Live enablement checks |
| `src/flow-live-config.ts` | Poll/timeout/model options |
| `src/manual-scene-transitions.ts` | Manual scene FSM |
| `recipes/google-flow.unverified.json` | Default UI recipe (unverified name) |
| `src/live.ts` / package `./live` export | Live entry |

---

## Packages — media-engine

| Path | Key symbols |
|---|---|
| `src/assemble.ts` | `assembleProject` |
| `src/quality.ts` | `evaluateQualityGates` |
| `src/media-contract.ts` | `DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT`, `readMediaContractFromEnv` |
| `src/captions.ts` | SRT + burn-in helpers |
| `src/probe.ts` | `probeMedia` |
| `src/synthesize.ts` | Mock color clips |
| `src/sample-frames.ts` | `sampleFramesAtTimestamps` |
| `src/crop-region.ts` | `cropNormalizedRegion` |
| `src/match-edit.ts` | `renderMatchEdit` |
| `src/match-edit-quality.ts` | Match quality gates |
| `src/ocr/create-ocr-provider.ts` | `createOcrProvider` |
| `src/ocr/tesseract-cli.ts` | Local OCR |
| `src/ocr/scripted-ocr.ts` | Test/fallback OCR |
| `src/paths.ts` | `resolveMediaToolPaths` |
| `src/roster-fixture.ts` | Synthetic roster video for tests |

---

## Packages — other

| Package | Important files |
|---|---|
| `shared-types` | `src/constants.ts` (`BUSINESS_DEFAULTS`, `PHASE`), workflow/scene enums, game/social enums |
| `validation` | `project-dna.ts`, `screenplay-v1`, `game-knowledge*`, `match-*`, `distribution.ts` |
| `storage` | `factory.ts`, `local-file-storage.ts`, `r2-storage.ts`, `memory-storage.ts`, `lifecycle.ts` |
| `credit-manager` | `types.ts`, `memory-credit-ledger.ts`, `file-credit-ledger.ts` |
| `chatgpt-import` | `prompt.ts` (`buildChatGptProductionPrompt`), `import-screenplay`, `commentary-prompt.ts` |
| `notification` | Memory store, publisher, VAPID helpers, hub |
| `n8n-integration` | `publisher.ts`, `client.ts`, HMAC, `OrchestrationController` |

---

## Tests (representative)

| Area | Example paths |
|---|---|
| Generation | `packages/workflow-engine/src/sequential-generation-runner.test.ts` |
| Flow gates | `packages/flow-adapter/src/flow-live-gates.test.ts` |
| Assembly | `packages/media-engine/src/assemble.test.ts`, `quality.test.ts` |
| DNA / screenplay | `packages/validation/src/project-dna.test.ts`, `screenplay-v1.test.ts` |
| MLBB | `packages/database/src/match-*.test.ts`, `game-knowledge*.test.ts` |
| Web gates | `apps/web/src/lib/generation/assembly-gate.test.ts` |
| n8n | `packages/n8n-integration/src/*.test.ts` |

---

## How to navigate for a new feature

1. **Domain model** → add Zod in `validation`, SQL migration in `database/migrations`, Memory+Supabase repos.
2. **Business workflow** → extend `workflow-transitions` and/or new job type in `workflow-engine`.
3. **Media** → extend `media-engine` (prefer FFmpeg helpers over new binaries).
4. **UI** → App Router page + server actions under `apps/web/src/app`.
5. **Operator automation** → `scripts/*.mjs` CLI wrapping package functions (pattern used by MLBB).
6. **Do not** put game facts into Project DNA — use game KB tables.
