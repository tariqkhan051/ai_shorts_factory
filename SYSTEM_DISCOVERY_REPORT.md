# SYSTEM DISCOVERY REPORT

**Repository:** `D:\repos\personal\ai_shorts_factory`  
**Product:** AI Shorts Factory — AI-assisted short-form video production platform  
**Inspection date:** 2026-11-05  
**Method:** Source-code investigation of apps, packages, migrations, scripts, CI, and env templates. Documentation cross-checked but **not** treated as proof of implementation.  
**Constraints honored:** No source modifications beyond these report files; no dependency installs; no paid API calls; no schema/data changes; no video/audio generation.

**Companion deliverables:**

- `SYSTEM_CAPABILITY_MATRIX.md`
- `SYSTEM_ARCHITECTURE.md`
- `SYSTEM_FILE_MAP.md`
- `TECHNICAL_CONSTRAINTS.md`

---

## 1. Executive summary

AI Shorts Factory is a **pnpm + Turborepo TypeScript monorepo** (phase **7 — Hardening and Deployment**) that implements a **human-in-the-loop vertical shorts factory**:

1. Create brand/project (+ versioned **Project DNA**).
2. Build a **copy/paste ChatGPT prompt** and **import** a Zod-validated screenplay JSON (no OpenAI API).
3. Prepare **5 scenes**, generate via **mock provider** (default) or **manual Google Flow upload** or **gated Playwright automation**.
4. **Assemble** with FFmpeg into a **≤59s 1080×1920** MP4 with optional burned captions.
5. Download a **publishing pack**; confirm social posts **manually** (no YouTube/Meta APIs).

Separately, a substantial **MLBB match-intelligence subsystem** exists (migrations 00008–00012, packages, CLIs, Game KB UI, Match Analysis docs page): game knowledge with Original/Advance patches, roster OCR, event timelines, grounded commentary, and event-based FFmpeg edits/Shorts. It is **not** integrated into the main project → Flow → assemble UX loop.

**Critical architectural gaps for scale / long-form:**

- Job queue is **in-memory per process**; Postgres `workflow_jobs` is schema-only from the app’s perspective.
- `media-worker` does **not** process real assembly jobs.
- Web generation always uses the **mock** provider; live Flow belongs to flow-worker/canary.
- Shorts media contracts reject long clips; long VODs belong on the **match** path.
- No org/tenant model; isolation is **per user**.
- No TTS, embeddings, paid vision adapter, Blender, or social upload SDKs.

**Overall assessment:** The shorts factory core (story → mock/manual generation → FFmpeg assemble → notify → manual publish metadata) is **genuinely implemented**. Live Flow and multi-instance workers are **gated / partial**. MLBB libraries are **real backend+CLI**, with **thin web UI**. The system is a strong reuse base for MLBB productization **if** long-form work stays on the match/media-engine track and a durable queue is added—not by stretching the 5×8s shorts assembler.

---

## 2. Actual product capabilities

### Genuinely implemented (operational in default local/mock modes)

- Project / brand / video content platform with soft deletes.
- Versioned Project DNA and video context pinning.
- Character bible + reference images + environment library.
- ChatGPT prompt builder + screenplay import/approve/edit.
- Mock sequential scene generation with credit reservation.
- Manual Google Flow package + media-contract validation + scene upload.
- FFmpeg assembly, quality gates, caption burn-in, MP4 + publishing pack download.
- In-app notifications + SSE dashboard; optional web push plumbing.
- Supabase auth path + memory-store bypass for local dev.
- Dual Memory/Supabase repositories and SQL migrations with RLS.
- Object storage factory (memory/local/R2).
- Optional n8n signed event emission and automation UI.
- MLBB game KB import/publish (OS vs Advance).
- MLBB match ingest, OCR roster, event timeline, commentary, match edit CLIs + libraries.

### Partially implemented

- Live Google Flow Playwright generation (heavy env gates; canary-oriented).
- Worker processes (exist; not shared-queue production runners).
- Social distribution (CRUD + manual confirm only).
- `FINAL_APPROVAL` workflow state (enum/transitions exist; product UI incomplete vs assembly completing at `COMPLETED`).
- Postgres credit_ledger / workflow_jobs (tables exist; TS runtime uses file/memory).
- Library page (placeholder).
- Match analysis web page (instructions only).

### Mock / simulated

- Default video generation provider (`MockVideoGenerationProvider`).
- Synthetic FFmpeg color clips when placeholders allowed.
- Scripted OCR fallback when Tesseract unavailable.
- Roster fixture video for tests (not real MLBB footage).

### Missing / not present

- Organizations, tenants, workspaces.
- Automatic YouTube/Instagram/Facebook/TikTok publishing.
- OpenAI/Gemini/Kling/Runway/ElevenLabs SDK integrations.
- TTS narration mix for match commentary.
- Paid cloud vision adapter (explicitly throws).
- Embeddings / vector RAG.
- Blender.
- Durable shared job queue adapter.
- Full interactive match review UI.
- Continuous 30–60 minute HUD CV (scoreboard/minimap) productization.

---

## 3. Technology stack

| Layer | Choice | Version evidence |
|---|---|---|
| Language | TypeScript | `typescript` ^5.7.2 |
| Runtime | Node.js | `engines.node` ≥20; `.nvmrc` = `20` |
| Package manager | pnpm | `packageManager: pnpm@9.15.0` |
| Monorepo | pnpm workspaces + Turborepo | `turbo` ^2.3.3 |
| Web | Next.js App Router | `next` ^15.5.7 |
| UI | React 19 + Tailwind 3.4 | `apps/web/package.json` |
| Validation | Zod | ^3.24.1 |
| Auth / DB | Supabase Auth + Postgres | `@supabase/ssr` ^0.5.2, `@supabase/supabase-js` ^2.49.1 |
| ORM | **None** — SQL migrations + repository classes | `packages/database/migrations` |
| Object storage | Local FS / Cloudflare R2 / memory | `packages/storage` (+ AWS S3 client for R2) |
| Jobs | In-memory queue | `MemoryJobQueue` |
| Media | FFmpeg / FFprobe CLI | `media-engine` |
| OCR | Tesseract CLI (optional) | `createOcrProvider` |
| Browser automation | Playwright (Flow) | flow-adapter live |
| Tests | Vitest | ^2.1.8 |
| CI | GitHub Actions | `.github/workflows/ci.yml` |
| Orchestration (optional) | n8n | Docker image 1.72.1 |

---

## 4. Repository architecture

```text
apps/
  web/            Next.js modular monolith (UI + server actions + API routes)
  flow-worker/    Generation claim loop (mock or Playwright)
  media-worker/   FFmpeg smoke / stub assemble claimer
packages/
  database/       SQL migrations + Memory/Supabase repos + MLBB pipelines
  workflow-engine/ Job queue + SequentialGenerationRunner
  flow-adapter/   VideoGenerationProvider implementations
  media-engine/   FFmpeg assemble, probe, OCR, match-edit
  storage/        Object storage adapters
  credit-manager/ Credit ledger
  shared-types/   Enums + BUSINESS_DEFAULTS + PHASE
  validation/     Zod schemas
  chatgpt-import/ Prompt builders + JSON import (no paid API)
  notification/   In-app + push helpers
  n8n-integration/ Signed webhooks + orchestration controller
scripts/          Ops + MLBB CLIs + Flow inspect/canary helpers
docs/             Architecture, phases, ops, n8n
docker/n8n/       Optional n8n compose
assets/           Sample game-knowledge JSON, etc.
.data/            Local durable runtime data (gitignored pattern)
```

**PHASE:** `packages/shared-types/src/constants.ts` → `PHASE.current = 7`, `Hardening and Deployment`.

---

## 5. Application modules

| Module | Responsibility |
|---|---|
| Content platform | Brands, projects, videos, DNA, environments, social accounts, distributions |
| Story studio | Prompt context, ChatGPT import, story versions, approval |
| Character bible | Library characters, versions, reference assets |
| Generation | Scene rows, credits, provider calls, scene state machine |
| Flow HITL | Manual package, uploads, assembly gate (mock vs real) |
| Assembly | FFmpeg normalize/concat/captions/QC |
| Notifications | Store, SSE hub, optional VAPID |
| n8n bridge | Outbound events, status API for n8n, retry |
| Game knowledge | Profiles, OS/AS patches, heroes/abilities, publish |
| Match intelligence | Sources, OCR jobs, timelines, commentary, edits |
| Workers | Optional separate processes for gen/assemble |

---

## 6. Frontend screen inventory

| Screen | Route | Purpose | Main components / deps | Status |
|---|---|---|---|---|
| Dashboard | `/` | Stats, recent projects, live alerts | `live-dashboard`, notifications | Operational |
| Login / Signup | `/login`, `/signup` | Auth | Supabase forms; memory redirects | Operational (mode-dependent) |
| Brands | `/brands` | Brand CRUD | `create-brand-form` | Operational |
| Projects list | `/projects` | List projects | repos | Operational |
| New project | `/projects/new` | Create | `project-form` | Operational |
| Project hub | `/projects/[id]` | Workflow overview | progress UI | Operational |
| Story | `/projects/[id]/story` | Prompt + import + edit + approve | `screenplay-editor`, chatgpt-import | Operational (manual ChatGPT) |
| Characters | `/projects/[id]/characters` | Project cast | character forms/upload | Operational |
| Global characters | `/characters` | Library | same | Operational |
| Environments | `/projects/[id]/environments` | Env library | create form | Operational |
| DNA | `/projects/[id]/dna` | View/publish DNA | `publish-dna-form` | Operational |
| Flow package | `/projects/[id]/flow-package` | Manual Flow HITL | scene cards, upload | Operational |
| Generate | `/projects/[id]/generate` | Mock gen + live canary panels | generation actions | Mock primary; live gated |
| Assemble | `/projects/[id]/assemble` | Start assembly + download | `assembly-download-panel` | Operational |
| Automation | `/projects/[id]/automation` | n8n controls | `automation-panel` | Partial (optional) |
| New video | `/projects/[id]/videos/new` | Add video unit | form | Operational |
| Video detail | `/projects/[id]/videos/[videoId]` | Video hub | — | Operational |
| Distribution | `.../distribution` | Destinations + manual publish | distribution forms | Partial (manual only) |
| Social accounts | `/social-accounts` | Register accounts | form | Partial (registered status) |
| Game KB | `/game-knowledge` | Import/publish patches | KB forms | Operational for import/publish |
| Match analysis | `/match-analysis` | CLI instructions | static + `requireUser` | Docs UI; pipeline via CLI |
| Library | `/library` | Future asset library | empty placeholder | Placeholder |
| Settings | `/settings` | Env/mode summary | — | Partial |

**Reusable UI patterns:** multipart uploads (manual scene + references), media download routes, screenplay editor, assembly download panel, approval confirm phrases, notification center, workflow progress, SSE live dashboard.

---

## 7. Backend API inventory

### Route handlers

| Endpoint | Role | Auth |
|---|---|---|
| `GET /api/health` | Liveness | Public |
| `GET /api/ready` | Readiness (store/R2/Flow gates) | Public (no secrets) |
| `POST /api/projects/[id]/generate` | Enqueue generation + inline process | `requireUser` |
| `POST /api/projects/[id]/assemble` | Enqueue assembly + inline process | `requireUser` |
| `GET /api/projects/[id]/assembly` | Assembly JSON | `requireUser` |
| `GET /api/projects/[id]/assembly/video` | Stream final MP4 | `requireUser` |
| `GET /api/projects/[id]/assembly/publishing` | Publishing pack | `requireUser` |
| `GET /api/projects/[id]/flow-package/manifest` | Manifest | `requireUser` |
| `GET /api/projects/[id]/scenes/[sceneId]/video` | Scene bytes | `requireUser` |
| `GET /api/references/[assetId]` | Reference asset | `requireUser` |
| `GET/PATCH /api/notifications` | List/mark | `requireUser` |
| `GET /api/notifications/stream` | SSE | `requireUser` |
| `GET /api/push/vapid-public-key` | VAPID public | — |
| `POST/DELETE /api/push/subscribe` | Push subscription | `requireUser` |
| `GET /api/n8n/health` | n8n status (no secrets) | — |
| `GET /api/n8n/projects/[id]/status` | Authoritative status for n8n | Bearer |
| `POST /api/n8n/events/retry` | Retry outbound event | `requireUser` |
| `GET /auth/callback` | OAuth exchange | Supabase |

Primary mutations are **Server Actions**, not REST. Domain logic lives in `packages/*` called from actions.

### Workers as “backend”

- `apps/flow-worker`: claims `GENERATE_*` / `RETRY_*` / `VERIFY_*` against **its own** memory queue.
- `apps/media-worker`: claims `ASSEMBLE_PROJECT` then fails unless smoke mode.

---

## 8. Actual workflow diagrams

See `SYSTEM_ARCHITECTURE.md` for Mermaid diagrams. Summary of the **shorts** lifecycle with code anchors:

| Step | Entry | Persistence | Processing |
|---|---|---|---|
| Create project | `createProjectAction` → `createProjectWithPlatform` | projects, DNA v1, optional video | — |
| Publish DNA | DNA actions → `ProjectDnaRepository.publishVersion` | `project_dna_versions`, `dna_current_version` | Existing videos **not** mutated |
| Story prompt | `buildPromptContext` + `buildChatGptProductionPrompt` | — | Operator ↔ ChatGPT site |
| Import story | `importScreenplayAction` | `story_versions`, characters sync | Zod parse |
| Approve | `approveStoryAction` | `stories.approved_at`, workflow | Optional n8n `video.approved` |
| Ensure scenes | `AppGenerationStore.ensureScenesFromScreenplay` | scenes map / DB | Requires approval |
| Mock generate | `startMockGenerationAction` / generate API | jobs + scene states | `SequentialGenerationRunner` + mock provider |
| Manual Flow | flow-package actions → `importManualSceneVideo` | assets + scene states | media-contract + storage |
| Live canary | preflight/confirm actions + flow-worker CLI | gated spend | Playwright provider |
| Assemble | `startAssemblyAction` → `assembleProjectForUser` | video_outputs / assembly files | `assembleProject` + quality gates |
| Notify | `NotificationPublisher` | notifications | SSE |
| Distribute | `createDistributionAction` / `confirmManualPublishAction` | `video_distributions` | **Human** posts externally |

**Failures / retries / cancel:** Job states `failed`/`cancelled` in `MemoryJobQueue`; scene states include `UNKNOWN_SUBMISSION`, `DOWNLOAD_FAILED`, `VERIFICATION_FAILED`; runner avoids blind retry after unknown/verification failures; project can enter `NEEDS_HUMAN_INTERVENTION` / `FAILED` / `PAUSED`.

**Progress monitoring:** Project workflow UI, notifications SSE, n8n status endpoint, assembly GET APIs.

---

## 9. AI integration inventory

| Capability | Provider | Model | Execution | Config | Real vs mock |
|---|---|---|---|---|---|
| Screenplay LLM | ChatGPT **website** | Operator-chosen | Human copy/paste | Prompt in `chatgpt-import` | Real operator workflow; **no API** |
| Commentary polish prompt | ChatGPT website | Operator-chosen | Human | `buildMatchCommentaryPolishPrompt` | Prompt only |
| Video generation | Mock | n/a | Local fake assets | `FLOW_PROVIDER=mock` | **Mock** (default) |
| Video generation | Google Flow UI | UI label e.g. `Veo 3.1 - Lite` | Playwright | `FLOW_*`, recipe JSON | **Real gated** |
| Video generation | Manual Flow | Operator exports | Upload | media contract | **Real media**, manual |
| Image gen | — | — | — | — | **Not implemented** as product API (reference uploads only) |
| Image understanding | Tesseract OCR | local | CLI | `TESSERACT_PATH` | **Real local** / scripted fallback |
| Paid vision | — | — | throws | `MATCH_PAID_VISION_ENABLED` | **Placeholder gate** |
| TTS | — | — | — | `MATCH_TTS_SPEND_ENABLED` | **Not implemented** |
| Embeddings / vector | — | — | — | — | **Not implemented** |
| STT | — | — | — | — | **Not implemented** |

**Prompt storage:** Zod DNA `prompt_instructions` + chatgpt-import builders; screenplay JSON in `story_versions.screenplay`.  
**Cost tracking:** credit-manager for Flow-like credits; match spend wrappers for future vision/TTS.  
**Caching:** Match analysis/timeline `cache_key` SHA-256; match cache metrics.  
**Fallbacks:** Mock provider; scripted OCR; synthetic assembly placeholders when allowed.  
**Secrets:** Only env **names** documented (`.env.example`); values not recorded here.

---

## 10. Media-processing architecture

**Core shorts assembly** (`packages/media-engine/src/assemble.ts`):

- Probe/decode validation.
- Optional synthetic color clips.
- Per-scene scale/pad to 1080×1920 @ 30fps.
- Concat demuxer.
- Optional SRT burn-in (`captions.ts`).
- Quality gate: duration ≤59s, exact resolution (`quality.ts`).

**Import contract** (`media-contract.ts`): ≤256 MiB, H.264, ~9:16, 1–20s, min 720×1280.

**Match media** (`sample-frames.ts`, `crop-region.ts`, `match-edit.ts`):

- Frame sampling at timestamps via FFmpeg.
- Normalized HUD crop regions.
- Event-window cutting, boring-gap speed-up, caption burn-in.
- Condensed edit + up to 2 Shorts ≤59s.
- Explicit comment: video-only MVP; TTS/audio mix later.

**Unsupported / out of scope:** Blender; arbitrary long-form **final** shorts assembly; rich transition library beyond concat/speed; automatic vertical “smart” reframing models (match edit assumes vertical-oriented processing via FFmpeg filters—**CANNOT VERIFY** advanced subject tracking).

**Long Android recordings (30–60 min):** Feasible as **`match_sources.local_path` inputs** to CLI pipelines; **not** as Flow scene imports or shorts `assembleProject` finals. Frame sampling is **sparse** (max frames capped), not full continuous CV.

---

## 11. Database entity inventory

### Core / content

| Entity | Table | PK | Notable FKs / fields | Soft delete | Isolation |
|---|---|---|---|---|---|
| User | `users` | `id` | → `auth.users` | — | auth uid |
| Project | `projects` | `id` | `user_id`, `brand_id`, `workflow_state`, `dna_current_version` | `deleted_at` | user |
| Project input | `project_inputs` | `id` | `project_id` unique | — | via project |
| Story / versions | `stories`, `story_versions` | `id` | screenplay jsonb | — | via project |
| Character / versions | `characters`, `character_versions` | `id` | `in_library`, refs | — | user |
| Project↔character | `project_characters` | composite | M2M | — | — |
| Reference asset | `reference_assets` | `id` | `storage_key` | `removed_at` | user |
| Scene | `scenes` | `id` | `scene_number` 1–5 | — | project |
| Generation job | `generation_jobs` | `id` | credits fields | — | project |
| Generated asset | `generated_assets` | `id` | `storage_key` | — | project |
| Workflow job | `workflow_jobs` | `id` | lease fields, payload | — | project |
| Approval | `approvals` | `id` | type/status | — | project |
| Video output | `video_outputs` | `id` | final storage | — | project |
| Credit ledger | `credit_ledger` | `id` | entry_type, amount | — | user |
| Notification | `notifications` | `id` | type | — | user |
| Push sub | `push_subscriptions` | `id` | endpoint keys | — | user |
| Brand | `brands` | `id` | colors jsonb | `deleted_at` | user |
| DNA version | `project_dna_versions` | `id` | `version`, immutable `snapshot` | — | project |
| Video | `videos` | `id` | pinned DNA + `context_snapshot` | `deleted_at` | project |
| Environment | `environments` | `id` | kind, active | — | project |
| Social account | `social_accounts` | `id` | platform, connection_status | — | user |
| Distribution | `video_distributions` | `id` | status, URLs | — | video |

### MLBB

| Entity | Table | Notes |
|---|---|---|
| Game profile | `game_profiles` | user-scoped slug |
| Server profile | `game_server_profiles` | `original` \| `advance` |
| Patch | `game_patches` | draft/published/archived |
| Knowledge source | `knowledge_sources` | checksums |
| Hero / ability | `hero_knowledge`, `ability_knowledge` | per patch |
| Match source | `match_sources` | local_path / storage_key, duration |
| Analysis job | `match_analysis_jobs` | cache_key unique |
| Timeline / events | `match_timelines`, `match_events` | windows, human corrections |
| Edit plan / edit | `match_edit_plans`, `match_edits` | planned→rendered→approved |
| KB sync / metrics | `kb_sync_*`, cache metrics (00012) | spend controls |

**Extension pattern:** Add Zod schema → SQL migration with RLS → Memory + Supabase repository pair → optional CLI → thin UI. Prefer new tables over overloading DNA JSON.

**ER diagram:** See `SYSTEM_ARCHITECTURE.md` §5.

---

## 12. Project DNA and knowledge architecture

**What DNA stores** (`packages/validation/src/project-dna.ts`): identity, visual continuity, storytelling preferences, production defaults (aspect, ≤5 scenes, ≤59s targets), prompt instruction blocks.

**Lifecycle:** Seeded on project create (`dnaSnapshotFromProject`); published via append-only `project_dna_versions` with incrementing `version`; `projects.dna_current_version` updated; videos pin version + compact `context_snapshot` at creation and are **not** rewritten on later DNA publishes.

**Prompt injection:** `apps/web/src/lib/projects/prompt-context.ts` → `buildChatGptProductionPrompt` embeds DNA + character/environment libraries.

**Not a general knowledge base:** DNA does not store hero kits, patch notes, or match events. Game knowledge uses **`game_patches` / `hero_knowledge`** with explicit Original vs Advance activation (`game-knowledge-activation.ts`). Match pipelines bind sources to a **published** patch+environment.

**Consistency across videos:** DNA + character visual identity locking + environment IDs in prompts; Flow reference images for characters. No vector memory.

**Game-specific knowledge addition:** Use existing game KB pattern (already implemented for MLBB samples), not DNA `universe_context` dumping.

---

## 13. Infrastructure and worker architecture

- **Dev default:** Next.js process holds `MemoryJobQueue`, file credit ledger, local object storage, memory studio snapshot.
- **Workers:** Optional; enabled via `FLOW_WORKER_ENABLED` / `MEDIA_WORKER_ENABLED`.
- **Concurrency:** Live Flow max 1; shorts generation sequential.
- **Observability:** Structured logging via shared-types logger patterns; health/ready probes; diagnostic screenshots for Flow; **no** Datadog/Sentry SDK found in-repo (**CANNOT VERIFY** production APM).
- **Crash recovery:** Lease expiry on memory queue is process-local—**jobs lost on process crash** unless persisted elsewhere. Worker restart tests exist for lease behavior in-process.
- **Scaling:** Not horizontally scalable for jobs until Postgres queue adapter + shared storage exist.

**Contention:** See `TECHNICAL_CONSTRAINTS.md` §10 — long match FFmpeg jobs must not share unconstrained capacity with interactive shorts assembly.

---

## 14. External integrations

| Integration | Actions | Auth | Real? | Limits |
|---|---|---|---|---|
| Supabase | Auth, Postgres, RLS | URL + anon / service role | Real when configured | Required for prod store |
| Cloudflare R2 | Put/get/signed URLs | S3 keys | Real when configured | Optional |
| Google Flow | Generate clips via UI | Persistent browser profile (manual login) | Gated real | Canary; no invented HTTP API |
| ChatGPT | Story/commentary polish | Operator account | Real human | No app API |
| n8n | Webhooks, orchestration | HMAC + API key | Real when enabled | Flow automation flag false |
| Tesseract | OCR | Local binary | Real if installed | Accuracy game-dependent |
| YouTube | — | — | **Manual only** | confirm URL |
| Facebook/Instagram/TikTok | — | — | **Manual only** | same |
| Moonton APIs | — | — | **Not called** | KB sync pulls operator artifacts only |

---

## 15. Testing and quality

| Kind | Evidence |
|---|---|
| Unit / package tests | Extensive `*.test.ts` across validation, workflow-engine, flow-adapter, media-engine, database (incl. MLBB), credit-manager, notification, n8n, selected web libs |
| CI | format, lint, typecheck, `pnpm test` with `FLOW_PROVIDER=mock`, audit (continue-on-error), validate:env, build |
| E2E against live Flow/YouTube | Intentionally absent / blocked in CI |
| Coverage report | **CANNOT VERIFY** numeric coverage % (no coverage artifact reviewed; test run in this session blocked by environment classifier) |
| Critical gaps | No shared-queue integration test across web+workers; no real MLBB VOD golden set in-repo (synthetic fixtures); social publish untested against platforms; paid vision/TTS untestable (unimplemented) |

---

## 16. MLBB feature readiness (A–X)

| ID | Capability | Status | Evidence / gap |
|---|---|---|---|
| A | Android gameplay video ingestion | **PARTIAL** | `ingestMatchVideo` + `match_sources.local_path`; no full web uploader for huge VODs |
| B | Long-form video analysis | **PARTIAL** | Timelines/edits designed for source duration; sampling capped—not dense full-match CV |
| C | Frame extraction / sampling | **YES** | `sampleFramesAtTimestamps` |
| D | Audio extraction / sound-event detection | **NO** | No audio event detector; match-edit notes video-only MVP |
| E | OCR / HUD recognition | **PARTIAL** | Tesseract + crop regions + HUD config; paid vision missing |
| F | Hero identification | **PARTIAL** | `matchHeroFromCatalog` / roster pipeline vs published patch |
| G | Player-name extraction / tracking | **PARTIAL** | Roster line parsing; continuous tracking not a full tracker product |
| H | Kill-feed recognition | **PARTIAL** | OCR text → event detect; depends on feed readability |
| I | Scoreboard recognition | **MISSING** | No dedicated scoreboard detector |
| J | Minimap interpretation | **MISSING** | No minimap CV |
| K | MLBB hero/ability knowledge | **YES** | game KB schema + import samples |
| L | OS vs Advance patch separation | **YES** | `game_server_environment`, activation asserts |
| M | Patch-note ingestion / updates | **PARTIAL** | Manual JSON import + artifact sync; no Moonton auto-feed; human publish |
| N | Timestamped event detection | **YES** | `match_events.timestamp_seconds` + types |
| O | Pre/post event context | **YES** | Event windows; edit plan pre/post pads |
| P | Evidence-based commentary | **YES** | `generateGroundedMatchCommentary` + validators |
| Q | Text-to-speech | **NO** | Spend flag only |
| R | Commentary synchronization | **PARTIAL** | Caption cues mapped to edits; no VO audio sync |
| S | Intelligent gameplay editing | **PARTIAL** | `buildMatchEditPlan` + `renderMatchEdit` |
| T | Full-match rendering | **PARTIAL** | Condensed (speed boring gaps) up to config max—not unedited 60min export as product default |
| U | Best 1–2 Shorts selection | **YES** | `max_shorts` ≤2, ranking in plan schema |
| V | Vertical reframing + captions | **PARTIAL** | Captions yes; smart reframe **CANNOT VERIFY** beyond FFmpeg scale/pad patterns |
| W | Human review / correction | **YES** | Timeline corrections; match edit approve phrase; story/Flow HITL patterns |
| X | Publishing / monetization workflow | **PARTIAL** | Manual distribution confirm; no ad/monetization APIs |

---

## 17. Reusability assessment

| Component | Recommendation | Why |
|---|---|---|
| `media-engine` FFmpeg helpers | **REUSE AS-IS** | Frame sample, crop, assemble, match-edit already exist |
| `validation` match/game schemas | **REUSE AS-IS** | Strong contracts |
| Game KB repos + activation | **REUSE AS-IS / EXTEND** | OS/AS model correct |
| Match pipelines + CLIs | **EXTEND** | Productize with UI + durable jobs |
| `SequentialGenerationRunner` | **NOT RELEVANT** for VOD analysis | Built for 5 Flow scenes |
| Project DNA | **NOT RELEVANT** as game KB | Wrong abstraction; keep for branded shorts |
| `MemoryJobQueue` | **REPLACE ONLY IF NECESSARY** (necessary for multi-process) | Add Supabase/Postgres adapter implementing same interface |
| `credit-manager` | **EXTEND** | Track match vision/TTS when enabled |
| `chatgpt-import` commentary polish | **REUSE AS-IS** | Evidence-safe polish prompt pattern |
| flow-adapter / Playwright | **NOT RELEVANT** for MLBB VOD | Unless generating synthetic animations |
| Distribution / social accounts | **EXTEND** | Keep manual until OAuth clients exist |
| Notification/SSE | **REUSE AS-IS** | Progress for long jobs |
| Next.js server actions pattern | **EXTEND** | Wrap match services behind authenticated actions |
| media-worker | **EXTEND** | Wire shared adapters; run match-edit jobs here |
| Library page | **CREATE NEW MODULE** content | Or extend into match asset browser |
| Scoreboard/minimap CV | **CREATE NEW MODULE** | No existing detector |
| TTS provider | **CREATE NEW MODULE** | Behind spend flags |
| Full rewrite | **AVOID** | Dual-track architecture already separates concerns |

---

## 18. Technical limitations and risks

1. Process-local queues → lost work / no multi-instance.
2. 59s / 5-scene / 20s import hard product assumptions in shorts path.
3. Live Flow fragility (UI selectors, captcha, login) — recipe marked unverified.
4. OCR accuracy on real MLBB HUD unknown (fixtures synthetic).
5. No audio intelligence for fights/objectives.
6. Credit ledger duality (file vs Postgres) can diverge.
7. Manual publishing does not prove channel compliance/monetization.
8. Long VOD processing can starve interactive web if colocated.
9. Memory store lacks RLS — unsafe if exposed.
10. `FINAL_VIDEO_*` env unused by assembly code — config drift risk.

---

## 19. Recommended integration boundaries

1. **Shorts factory** remains Brand → Project → DNA → Story → Flow scenes → ≤59s assemble → manual distribute.
2. **Match intelligence** remains Game KB → Match source → Analyze → Timeline → Commentary → Edit → Approve → (reuse) distribution records.
3. Connect them only at: shared auth/user, storage, credits, notifications, optional `videos`/`video_distributions` for publishing outputs.
4. Do **not** force match VODs through `GENERATE_PROJECT_SCENES`.
5. Add durable `JobQueue` implementation before backgrounding 30–60 min analyses.
6. Keep paid vision/TTS behind existing deny-by-default flags.
7. Prefer new `match_*` UI routes that call existing package functions (CLI parity).

---

## 20. Questions that cannot be answered from repository evidence

1. Accuracy of roster/kill-feed OCR on **real** MLBB Android recordings across devices/resolutions.
2. Whether any production deployment currently uses Supabase+R2 vs memory/local (env not inspected for secrets).
3. Real Google Flow credit burn rates / UI stability on current Google DOM.
4. Numeric unit-test coverage percentage and latest CI run status on `main` (**this session could not execute tests** — environment classifier rejected shell test runs).
5. Actual disk/CPU capacity of operator machines.
6. Whether `API_RATE_LIMIT_PER_MINUTE` is enforced on all routes (config present; full middleware enforcement not exhaustively traced).
7. Legal/ToS constraints for MLBB content monetization (policy, not code).
8. Whether Advance vs Original HUD layouts differ enough to need separate recognition configs in production (schema supports overlays; empirical tuning not in-repo).
9. End-to-end latency for a 60-minute VOD through current CLI pipeline.
10. Whether n8n workflows in `docs/n8n` are deployed anywhere.

---

## Appendix A — Related prior document

`MLBB_INTEGRATION_AUDIT.md` exists and documents milestones 1–7. This discovery report **independently verified** those milestones against migrations and package sources, and additionally audited the **full shorts factory**, workers, publishing, and constraints. Prefer this report + the four companion files as the baseline for architecture planning.
