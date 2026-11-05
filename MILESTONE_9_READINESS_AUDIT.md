# Milestone 9.0 — Repository & Supabase Readiness Audit

**Status:** COMPLETE (read-only)  
**Date:** 2026-11-05  
**Scope:** No application code changes. Inventory + sequence for M9.1–M9.10.  
**Companion:** `SUPABASE_FREE_TIER_LIMITATIONS.md`

---

## 1. Executive verdict

Match Studio M0–M8 left a **working foundation** (lifecycle, Memory repos, FileJobQueue, UI shells, media helpers) but **not** a production end-to-end path.

Supabase is **already partially integrated** for the Shorts Factory content platform (Auth + dual Memory/Supabase repositories + SQL migrations with RLS). Match Studio **does not** yet use that path: web runtime hard-wires Memory repositories and a File/Memory job queue.

**Architectural lock for M9 (confirmed feasible on Free):**

| Concern | System of record |
|---|---|
| Application data, jobs metadata, ownership | **Supabase Postgres** (Free) |
| Auth sessions | **Existing Supabase Auth** (keep; do not replace) |
| Multi-GB recordings & renders | **R2 or local** via `packages/storage` — **not** Supabase Storage |
| FFmpeg / OCR / audio / render | **`apps/media-worker`** — **not** Edge Functions |
| Shorts Flow pipeline | Untouched; Match jobs never use `ASSEMBLE_PROJECT` / Flow scene limits |

---

## 2. Existing implementation (reuse)

### 2.1 Documentation (authoritative designs)

| File | Use |
|---|---|
| `MATCH_STUDIO_ARCHITECTURE.md` | Target queue/worker/media split |
| `MATCH_STUDIO_DATA_MODEL.md` | Entity map (note: §2 “no project_id” is **stale** — fixed in `00013`) |
| `MATCH_STUDIO_API_CONTRACTS.md` | Job types, idempotency keys, action names |
| `MATCH_STUDIO_TEST_PLAN.md` | Case IDs to extend |
| `MATCH_STUDIO_IMPLEMENTATION_STATUS.md` | Honest gap list |
| `MATCH_STUDIO_IMPLEMENTATION_PLAN.md` | Original M0–M8 plan |
| `SYSTEM_*.md` / `TECHNICAL_CONSTRAINTS.md` | Monorepo constraints |

### 2.2 Supabase SDK & clients (already present)

| Item | Location | Notes |
|---|---|---|
| `@supabase/supabase-js` | `apps/web`, `packages/database` | ^2.49.1 |
| `@supabase/ssr` | `apps/web` | ^0.5.2 |
| Browser client | `apps/web/src/lib/supabase/client.ts` | Anon key only |
| Server cookie client | `apps/web/src/lib/supabase/server.ts` | `createServerClient` + anon |
| Middleware refresh | `apps/web/src/lib/supabase/middleware.ts` | Session refresh; not global route gate |
| Public env helper | `apps/web/src/lib/supabase/env.ts` | `NEXT_PUBLIC_SUPABASE_URL` + `ANON_KEY` |
| Store selection | `packages/database/src/config.ts` | `PROJECT_STORE` memory\|supabase; auto-detect if URL+anon set |
| Auth | `apps/web/src/lib/auth.ts` | Memory bypass vs Supabase `getUser` |

**Missing today:** dedicated service-role / worker Supabase client helper (env var exists; no `createServiceClient` in web).

### 2.3 Environment conventions (`.env.example`)

Already defined (placeholders only):

- `PROJECT_STORE`, `STORAGE_PROVIDER`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`
- R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, TTL
- Match: `MATCH_JOB_QUEUE`, `ASF_MATCH_JOB_QUEUE_PATH`, `MATCH_AUDIO_DETECTOR`, spend flags

Compatible with Free + R2/local. No paid-addon env required.

### 2.4 SQL migrations (single authority)

Path: `packages/database/migrations/`

| Migration | Relevance |
|---|---|
| `00001_init.sql` | `users`, `projects`, **`workflow_jobs`**, base RLS |
| `00003_phase7_hardening.sql` | workflow_jobs: user SELECT/INSERT only; **lease mutations = service role** |
| `00008`–`00012` | Game KB + match sources/analysis/timelines/events/edits + spend |
| **`00013_match_studio_lifecycle.sql`** | `match_studio_runs`, nullable patch, `project_id`/`probe_json` on sources, RLS, hero aliases |

**Apply via:** `scripts/migrate-check.mjs` guidance + `psql` + `SUPABASE_DB_URL` (no second migration tree).

**No generated `Database` TypeScript types package** — Zod + hand-mapped repos are authoritative today.

### 2.5 Dual repository pattern (content platform — template for Match Studio)

Working examples to mirror:

- `SupabaseProjectRepository`, `SupabaseStoryRepository`, …
- Factory: `apps/web/src/lib/projects/repository.ts` → Memory vs `new SupabaseX(await createClient())`
- **Production rule already:** `requireSupabase()` throws if store=supabase but client missing (no silent Memory fallback)

Match Studio **does not** follow this factory yet.

### 2.6 Match Studio domain (Memory-only)

| Component | Path |
|---|---|
| Types + interface | `packages/database/src/match-studio-types.ts` |
| Memory repo | `packages/database/src/memory-match-studio-repository.ts` |
| Service | `packages/database/src/match-studio-service.ts` |
| Validation/FSM | `packages/validation/src/match-studio.ts` |
| Tests | `packages/database/src/match-studio.test.ts` (3) |
| Web wiring | `apps/web/src/lib/match-studio/runtime.ts` — **always Memory** |
| UI | `apps/web/src/app/match-studio/**` |
| Actions | `apps/web/src/app/match-studio/actions.ts` |

Related Memory repos (also no Supabase twin):

- `MemoryMatchAnalysisRepository`
- `MemoryMatchTimelineRepository` (`correctEvent`, `addManualEvent`)
- `MemoryMatchEditRepository`
- Commentary: builders/services **without** a SQL commentary table / repository interface

### 2.7 Job queues

| Adapter | Status |
|---|---|
| `MemoryJobQueue` | Tests + Flow web path |
| `FileJobQueue` | **Current Match Studio default** (web + media-worker share JSON file path) |
| `PostgresJobQueue` | **Implemented** (`packages/workflow-engine/src/postgres-job-queue.ts`) with `FOR UPDATE SKIP LOCKED`, cancel, idempotent enqueue — **not wired** to any SQL client / env |

Web/runtime & media-worker: `MATCH_JOB_QUEUE=file|memory` only — **no `postgres` mode**.

### 2.8 Storage

| Provider | Path | Large-file readiness |
|---|---|---|
| Memory | `memory-storage.ts` | Tests |
| Local | `local-file-storage.ts` | Dev durable `.data/objects` |
| R2 | `r2-storage.ts` | `putObject`, **single** `createSignedUploadUrl` (Presigned PUT) |

`ObjectStorage` interface (`packages/storage/src/types.ts`): safe keys, signed download/upload.  
**Gap:** no multipart / resumable API (CreateMultipartUpload / UploadPart / Complete). Presigned PUT is inadequate for multi-GB browser uploads without chunking.

No Supabase Storage adapter exists (correct for Free — do not make it primary).

### 2.9 Media worker & media-engine

| Piece | Status |
|---|---|
| `apps/media-worker` | Claims File/Memory queue; `MATCH_INGEST_PROBE` partial; **all other MATCH_* fail with explicit message** |
| `renderFullMatch` | Library helper in `packages/media-engine/src/full-match-render.ts` |
| Match ingest contract | Separate from Flow 20s — tested |
| TTS | Interface + mock; spend-gated |
| Audio detector | **`StubAudioEventDetector` only** (`MATCH_AUDIO_DETECTOR=stub`) |
| Scoreboard/minimap | Capability flags `not_implemented` |

### 2.10 Auth & security today

- Supabase Auth integrated; Memory mode uses fixed UUID for local.
- Match tables (`match_sources`, analysis, timelines, events, edits, `match_studio_runs`) already have **owner RLS** (`auth.uid() = user_id` or via timeline ownership).
- `workflow_jobs` RLS intentionally blocks lease updates for JWT users (service role required).
- **Risk:** service-role worker bypasses RLS → must enforce ownership in worker payload checks (documented in M9.3).
- No automated RLS cross-user tests against a live Supabase project in CI.

### 2.11 CI

`.github/workflows/ci.yml`: format, lint, typecheck, `pnpm test`, env validate, build.  
No live Supabase integration job. Unit tests use Memory.

### 2.12 Historical test baseline (re-verify after code changes)

| Suite | Last known |
|---|---:|
| validation | 27 |
| workflow-engine | 23 |
| media-engine | 20 |
| database | 53 |
| web typecheck | PASS |

---

## 3. Missing implementation (gap matrix → M9.x)

| Gap | Milestone |
|---|---|
| Typed Supabase config / service-role + DB clients; startup validation; docs | **9.1** |
| `SupabaseMatchStudioRepository` (+ analysis/timeline/edit/commentary persistence) | **9.2** |
| Wire Match Studio factory like `getProjectRepository`; no silent Memory fallback in supabase mode | **9.2** |
| Commentary SQL table (or approved jsonb home) — **no table today** | **9.2** migration |
| Correction audit fields (original prediction, corrector, timestamp) beyond overwrite-to-`source=human` | **9.2 / 9.6** |
| RLS tests + security doc; worker ownership asserts | **9.3** |
| Browser resumable upload via R2 multipart / signed parts; progress UI; verify before ready | **9.4** |
| Optional Supabase Storage adapter capped at Free 50 MB | **9.4** (optional) |
| Wire `PostgresJobQueue` + `SUPABASE_DB_URL`; media-worker `postgres` mode | **9.5** |
| Complete MATCH_* handlers with shared storage object refs (not localhost-only paths) | **9.5 / 9.8** |
| Interactive timeline correction UI | **9.6** |
| Real local audio detector (heuristic OK if honest) | **9.7** |
| End-to-end render + verify + persist outputs | **9.8** |
| E2E acceptance test (Memory always; Supabase when configured) | **9.9** |
| Ops dashboard / health / cleanup of temps only | **9.10** |

---

## 4. Exact files to reuse

**Do not rewrite — extend:**

- `packages/database/src/match-studio-types.ts` + `match-studio-service.ts`
- `packages/database/src/memory-match-*-repository.ts` (keep for tests/dev)
- `packages/database/src/supabase-project-repository.ts` (pattern)
- `packages/database/migrations/00013_*.sql` + prior match migrations
- `packages/workflow-engine/src/postgres-job-queue.ts` + `job-types.ts`
- `packages/storage/src/{types,factory,r2-storage,local-file-storage}.ts`
- `packages/media-engine/src/{full-match-render,match-ingest-contract,audio/audio-event-detector,match-edit*}.ts`
- `apps/web/src/lib/{auth,env,supabase/*,projects/repository}.ts`
- `apps/web/src/app/match-studio/**`
- `apps/media-worker/src/index.ts`
- `.env.example`, `scripts/migrate-check.mjs`, `scripts/validate-env.mjs`

---

## 5. Exact files to modify (planned; not done in M9.0)

| File | Change intent |
|---|---|
| `apps/web/src/lib/match-studio/runtime.ts` | Store-aware repo + Postgres queue selection |
| `apps/web/src/app/match-studio/actions.ts` | Upload session, register after verify, enqueue durable jobs |
| `apps/web/src/app/match-studio/**/page.tsx` (+ new components) | Upload UI, timeline editor, ops/health |
| `apps/media-worker/src/index.ts` | Postgres queue; real MATCH_* handlers; storage download |
| `packages/storage/src/r2-storage.ts` (+ types/factory) | Multipart / resumable upload support |
| `packages/workflow-engine` | Optional progress helpers; wire tests for Postgres with injectable client |
| `packages/database/src/index.ts` | Export new Supabase match repos |
| `packages/media-engine/src/audio/*` | Non-stub detector |
| `.env.example` | Document `MATCH_JOB_QUEUE=postgres`, upload limits, Free caveats |
| `MATCH_STUDIO_IMPLEMENTATION_STATUS.md` | Per-milestone updates |
| `MATCH_STUDIO_DATA_MODEL.md` | Fix stale `project_id` note when touching docs in later M |

---

## 6. Proposed new files

### Documentation (M9 deliverables)

| File | Milestone |
|---|---|
| `SUPABASE_FREE_TIER_LIMITATIONS.md` | **9.0 (this audit)** — done |
| `MILESTONE_9_READINESS_AUDIT.md` | **9.0** — this file |
| `SUPABASE_SETUP_GUIDE.md` | 9.1 |
| `SUPABASE_SECURITY_AND_RLS.md` | 9.3 |
| `MATCH_STUDIO_STORAGE_ARCHITECTURE.md` | 9.4 |
| `MATCH_STUDIO_WORKER_ARCHITECTURE.md` | 9.5 |
| `MATCH_STUDIO_END_TO_END_TESTS.md` | 9.9 |

### Code (indicative)

| File | Milestone |
|---|---|
| `packages/database/src/supabase-match-studio-repository.ts` | 9.2 |
| `packages/database/src/supabase-match-analysis-repository.ts` | 9.2 |
| `packages/database/src/supabase-match-timeline-repository.ts` | 9.2 |
| `packages/database/src/supabase-match-edit-repository.ts` | 9.2 |
| `packages/database/src/supabase-match-commentary-repository.ts` (+ migration `00014_…`) | 9.2 |
| `packages/database/src/match-studio-rls.test.ts` or integration harness | 9.3 |
| `apps/web/src/lib/supabase/service.ts` (or `packages/database` admin client) | 9.1 |
| `packages/database/src/pg-client.ts` (thin `query` wrapper over `pg` / pooler) | 9.1 / 9.5 |
| `packages/storage/src/r2-multipart.ts` or methods on R2 class | 9.4 |
| `apps/web/src/components/match-studio/*-upload*.tsx`, `*-timeline-editor*.tsx` | 9.4 / 9.6 |
| `packages/media-engine/src/audio/heuristic-audio-event-detector.ts` | 9.7 |
| `apps/web/src/app/match-studio/ops/page.tsx` (or `/api/match-studio/health`) | 9.10 |
| E2E test under `packages/database` or `apps/web` | 9.9 |

Avoid creating a parallel schema in Supabase Dashboard SQL editor — **migrations folder only**.

---

## 7. Database migration requirements

| Need | Action |
|---|---|
| Apply `00001`–`00013` on Free project | Setup guide (9.1) |
| Commentary persistence | **New** `00014_match_commentary_persistence.sql` (scripts + segments + approval + style) |
| Correction audit trail | Prefer additive columns on `match_events` (e.g. `original_json`, `corrected_by`, `corrected_at`) rather than destructive overwrite — align with M9.6 requirements |
| Voice/TTS metadata | jsonb on run or small `match_voice_jobs` table if not fitting commentary |
| Job progress artifacts | Prefer `workflow_jobs.payload` + existing match status columns; new table only if payload insufficient |
| Storage object refs | Already `match_sources.storage_key` / `local_path`; ensure checksum + byte_size filled on verify |
| Generated types | Optional `supabase gen types` script later; Zod remains validation authority |

Do **not** duplicate `match_studio_runs` or fork Game KB tables.

---

## 8. Security risks

| Risk | Mitigation in M9 |
|---|---|
| Service role in browser | Never; server/worker only |
| Worker bypasses RLS | Explicit `userId`/`projectId` checks on every claim; refuse mismatched payload |
| Signed upload path traversal | Reuse `assertSafeStorageKey` + user/run-scoped key builder |
| Arbitrary overwrite of other users’ keys | Bind key prefix `users/{userId}/match-studio/{runId}/…` |
| Silent Memory fallback in prod | Keep throw-on-misconfig; UI error |
| Local path mistaken for cloud upload | Honest UI copy (already partially present) |
| RLS untested | Automated tests with two users when Supabase test project configured |
| Free project pause | Health checks surface “DB paused / unavailable” |
| Auto-delete originals for quota | **Forbidden** |

---

## 9. Supabase Free limitations (summary)

See `SUPABASE_FREE_TIER_LIMITATIONS.md`. Binding numbers:

- DB **500 MB**, Storage **1 GB**, file max **50 MB**, egress **5+5 GB**, pause after **1 week**, Edge **150s / 2s CPU**, Nano **~60** direct connections.

**Video processing and multi-GB media are out of Free Storage by design.**

---

## 10. R2 / local storage strategy

```text
Browser (large VOD)
  → short-lived R2 multipart / resumable credentials (server-minted)
  → verify object exists + size/checksum
  → persist match_sources.storage_key + probe
  → enqueue MATCH_* on Postgres workflow_jobs

Dev without R2
  → local path registration OR local ObjectStorage put
  → FileJobQueue or Postgres if DB configured
  → UI must say "local registration" not "cloud upload"

Worker
  → download via ObjectStorage to work dir (or stream)
  → write outputs back to ObjectStorage
  → persist metadata in Supabase only
```

Cloudflare R2 free tier is separate from Supabase billing; still preferred over paid Supabase Storage for large media. If R2 is unconfigured, **do not** pretend browser cloud upload works.

---

## 11. Auth decision (least disruption)

**Keep existing Supabase Auth + Memory bypass.**

- Integrate Match Studio under `requireUser()` (already).
- When `PROJECT_STORE=supabase`, require real session for Match Studio mutations.
- Do **not** blind-migrate Auth providers or introduce orgs/tenants.
- Document session expiry / sign-out in setup guide (already login/signup routes).

---

## 12. Recommended implementation sequence

Follow the master prompt order; no skipping:

| Step | Milestone | Exit criteria (behavior, not placeholders) |
|---|---|---|
| 1 | **9.0 Audit** | This doc + Free-tier doc |
| 2 | **9.1 Foundation** | Clients, env validation, setup guide; Memory still works without Supabase |
| 3 | **9.2 Repos** | Create/list/get run + attach recording against Supabase; Memory retained for tests |
| 4 | **9.3 RLS** | Cross-user deny tests + security doc; worker ownership checks |
| 5 | **9.4 Upload** | Real progress upload when R2 configured; local path alternative honest |
| 6 | **9.5 Worker** | Postgres claim + at least probe/analyze/render paths durable across restart |
| 7 | **9.6 Timeline UI** | Corrections persist and reload |
| 8 | **9.7 Audio** | Non-stub detector with tests; capability flag honest |
| 9 | **9.8 Render** | Worker completes full-match; verify; never mark failed as completed |
| 10 | **9.9 E2E** | Automated pipeline; Supabase optional gated |
| 11 | **9.10 Ops** | Health/diagnostics; temp cleanup; recovery doc |

After each: run relevant tests + typecheck; update `MATCH_STUDIO_IMPLEMENTATION_STATUS.md`; **do not commit unless asked**.

---

## 13. Non-goals / regression guards

- Do not route long VODs through Flow 1–20s / 5-scene assemble.
- Do not merge DNA with Game KB.
- Do not break OS/AS isolation.
- Do not enable paid vision/TTS without explicit user approval.
- Do not upgrade Supabase plan or enable paid add-ons.
- Preserve Shorts Factory Memory/Supabase repos and Flow mock defaults.

---

## 14. Audit completeness checklist

- [x] Match Studio design docs reviewed  
- [x] Implementation status + known gaps reviewed  
- [x] Migrations `00001`–`00013` inventoried  
- [x] Auth path inspected  
- [x] Local + R2 storage inspected  
- [x] Job queues (Memory/File/Postgres) inspected  
- [x] media-worker handlers inspected  
- [x] Match Studio UI/upload routes inspected  
- [x] Env conventions inspected  
- [x] CI inspected  
- [x] Supabase Free limits verified from official docs  
- [x] No application code modified in M9.0  

**Next:** Milestone **9.1 — Supabase foundation** (configuration, clients, migration strategy docs, env).
