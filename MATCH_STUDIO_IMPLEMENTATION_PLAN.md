# Match Studio — Implementation Plan

**Milestone focus:** Milestones 0–8 delivered (see `MATCH_STUDIO_IMPLEMENTATION_STATUS.md`).  
**Verified against:** repository source + `SYSTEM_*.md` discovery reports.  
**Git baseline at M0:** `master` @ `6409bf8` (`feat: add MLBB match intelligence plane (milestones 1-7)`).

Companion docs:

- [`MATCH_STUDIO_ARCHITECTURE.md`](./MATCH_STUDIO_ARCHITECTURE.md)
- [`MATCH_STUDIO_DATA_MODEL.md`](./MATCH_STUDIO_DATA_MODEL.md)
- [`MATCH_STUDIO_API_CONTRACTS.md`](./MATCH_STUDIO_API_CONTRACTS.md)
- [`MATCH_STUDIO_TEST_PLAN.md`](./MATCH_STUDIO_TEST_PLAN.md)
- [`MATCH_STUDIO_IMPLEMENTATION_STATUS.md`](./MATCH_STUDIO_IMPLEMENTATION_STATUS.md)

---

## 1. Implementation-readiness summary

The repository already contains a **library/CLI MLBB intelligence plane** and a separate **generative Shorts Factory**. Match Studio productizes the former without mutating Shorts constraints (5 scenes, ≤59s final, Flow import 1–20s).

| Category | Verdict |
|---|---|
| **Reuse as-is** | Game KB activation (`assertPatchEnvironmentMatch`, `filterAbilitiesForEnvironment`); Zod match/KB contracts; OCR provider factory; FFmpeg probe/sample/crop/match-edit; commentary grounding validators; match-spend flags; notifications; storage factory; dual Memory/Supabase repos |
| **Modify** | `WORKFLOW_JOB_TYPES` + `JobQueue` (add `cancel`, match job types); media-worker (real match jobs); match-edit for full-match + audio mix; commentary schema (styles/segments/approval); web match UI; ingest beyond `local_path`; match-only frame caps |
| **Create** | Durable Postgres `JobQueue` adapter; Match Studio lifecycle FSM; long-form `MATCH_INGEST_MEDIA_CONTRACT`; streaming upload to object storage; audio event detector interface; TTS provider interface + mock; richer EDL review model; additive KB fields (aliases/items) as needed; `/match-studio` interactive UI |
| **Authoritative (do not fork)** | `game_patches` OS/AS isolation; activation asserts; `workflow_jobs` + `JobQueue` interface; `ObjectStorage`; `CreditLedger` / match-spend gates; `BUSINESS_DEFAULTS` for **shorts only** |

### Locked architectural decisions

1. Preserve Shorts Factory Flow/assemble paths unchanged.
2. Each Match Studio match = a `projects` row (category `gaming`) + existing `match_sources`; M1 adds additive `match_sources.project_id` so `workflow_jobs.project_id` FK remains valid. Project DNA is **not** used for game facts.
3. Durable queue = Postgres adapter behind `JobQueue` (M2); keep `MemoryJobQueue` for tests/dev. Prefer Postgres over Redis.
4. Full-match render = new media-engine path; do **not** raise shorts `assembleProject` 59s limit.
5. TTS / audio events / scoreboard / minimap = interfaces + honest status flags first; visual/OCR-first.
6. No organizations/tenants in Match Studio v1 (user-scoped).

---

## 2. Existing schemas and services that remain authoritative

| Area | Authoritative location | Notes |
|---|---|---|
| Shorts business defaults | `packages/shared-types/src/constants.ts` → `BUSINESS_DEFAULTS` | Never relax for match VODs |
| Flow import contract | `packages/media-engine/src/media-contract.ts` | Match Studio uses a **separate** contract |
| Project workflow FSM | `packages/database/src/workflow-transitions.ts` | Shorts project states; Match Studio gets its **own** status enum |
| Job queue interface | `packages/workflow-engine/src/job-types.ts` | Extend types; do not replace interface |
| Game KB + OS/AS | `00008_game_knowledge.sql`, `game-knowledge-activation.ts` | Never mix environments |
| Match sources / analysis | `00009`–`00011`, `match-*-pipeline.ts` | Extend, don’t duplicate |
| Commentary grounding | `validation/match-commentary.ts`, `match-commentary-validate.ts` | Extend segment/style fields carefully |
| Spend gates | `match-spend.ts`, `MATCH_*_SPEND_ENABLED` | Default deny |
| Storage | `packages/storage` `createObjectStorage` | Local/R2/memory |
| Manual distribution | `video_distributions` + confirm actions | Remains manual |

---

## 3. Current limitations (verified)

### Job processing
- Only `MemoryJobQueue` (process-local).
- Postgres `workflow_jobs` exists; **no TS adapter**.
- `cancelled` state exists; **no `cancel()` on `JobQueue`**.
- Web and workers do not share a queue across processes.
- media-worker **intentionally fails** real `ASSEMBLE_PROJECT` jobs.

### Media engine
- Shorts assemble: ≤59s, 1080×1920, 5 scenes.
- Flow import: 1–20s, ≤256 MiB, H.264, ~9:16.
- Match-edit: condensed default 180s (schema max 600s); Shorts ≤59s ×2; **audio stripped** (`-an`).
- Frame sample max 24; default OCR only loading roster.

### Match pipeline
- CLI + library operational; web is docs/CLI hub.
- Ingest requires `local_path` + published `game_patch_id` (no unknown-patch yet).
- No TTS; paid vision throws; no audio event detector.
- No scoreboard/minimap implementations despite HUD region IDs.

---

## 4. Proposed implementation sequence (locked)

| Milestone | Goal | Exit criteria |
|---|---|---|
| **0** | Verify reports vs code; write plans | These six docs; **no app code** |
| **1** | Match Studio domain + lifecycle | Match project/recording entities, status FSM, patch binding (incl. explicit unknown), Zod + migration + tests; UI shell showing **real** statuses |
| **2** | Long ingest + durable jobs | Upload/metadata without Flow 20s limit; Postgres queue adapter; `cancel`; media-worker runs match jobs; retry |
| **3** | Match intelligence | Extend OCR/timeline; audio detector interface (+ first impl or clear stub status); correlation; human correction API/UI |
| **4** | Game Knowledge workflow | Harden import idempotency/review; additive schema only where needed; never auto-activate; OS/AS isolation tests |
| **5** | Commentary | Segment contract + styles + review; ChatGPT polish path preserved; provider-independent |
| **6** | Voice + editing | TTS interface + mock; EDL; full-match render + A/V sync; preview/approve |
| **7** | Shorts | Ranking + 1–2 vertical Shorts with captions; reviewer select/reject/regenerate |
| **8** | UI + hardening | Full Match Studio UX, costs, notifications, e2e tests, docs |

**Do not** implement later milestones inside earlier ones.  
**Do not** mark a milestone complete because CLI/schema already exist from the prior MLBB plane—user-facing + tested behavior is required.

---

## 5. Non-negotiable boundaries (enforcement checklist)

1. Shorts Factory keeps `DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT` and `BUSINESS_DEFAULTS.finalVideoMaxSeconds = 59`.
2. Match uploads use **`MATCH_INGEST_MEDIA_CONTRACT`** (new), never Flow import defaults.
3. Match jobs use new `WORKFLOW_JOB_TYPES` (e.g. `MATCH_INGEST`, `MATCH_ANALYZE_*`, `MATCH_RENDER_*`) — never `GENERATE_PROJECT_SCENES` / `ASSEMBLE_PROJECT` for VODs.
4. Project DNA remains creative identity; game facts live under `game_*` tables.
5. Original vs Advance binding via existing activation asserts on every analysis/commentary/render entrypoint.
6. Manual social distribution remains manual; Match Studio may attach outputs to `video_distributions` later without claiming auto-publish.
7. Paid vision/TTS require spend flags + confirmation; CI stays mock/local.

---

## 6. Milestone 1 scope preview (next coding milestone)

When Milestone 0 is accepted and Milestone 1 is explicitly started:

1. Define Match Studio status enum + Zod lifecycle in `packages/validation` / `shared-types`.
2. Migration: `match_sources.project_id` (+ optional unknown-patch fields); bind Match Studio `projects` with category `gaming` and game KB columns.
3. Repository APIs Memory + Supabase.
4. Web routes under `/match-studio` (evolve beyond `/match-analysis`) showing real entity state.
5. Tests for OS/AS isolation on bind and unknown-patch handling.

**Out of scope for M1:** durable queue, TTS, full UI for all phases, audio detectors, FFmpeg full-match renderer.

---

## 7. Risks, dependencies, migration requirements

| Risk | Mitigation |
|---|---|
| `workflow_jobs.project_id` NOT NULL FK | Match Studio uses a `projects` row + `match_sources.project_id` |
| Process-local queue | M2 Postgres adapter behind `JobQueue` |
| media-worker fails assemble | M2: match render handlers; leave shorts assemble tick path intact |
| Frame sample max 24 | Match-only config increase; document cost/time |
| Condensed ≠ full match | M6 dedicated full-match renderer |
| Missing aliases/items tables | M4 additive migrations; until then terminology jsonb |
| OCR accuracy on real Android HUD | Adapter status flags; human correction before “approved” |
| No audio detector | Interface in M3; UI shows limitation |
| Report vs code drift | Re-verify at each milestone start (`MATCH_STUDIO_IMPLEMENTATION_STATUS.md`) |

**Dependencies:** FFmpeg/FFprobe; optional Tesseract; Supabase for durable prod; R2 optional; no new queue vendor in v1.

---

## 8. Deliverable map

| Document | Purpose |
|---|---|
| `MATCH_STUDIO_IMPLEMENTATION_PLAN.md` | This plan + readiness |
| `MATCH_STUDIO_ARCHITECTURE.md` | Boundaries, diagrams, package ownership |
| `MATCH_STUDIO_DATA_MODEL.md` | Entities, migrations strategy |
| `MATCH_STUDIO_API_CONTRACTS.md` | Job types, Zod, actions/routes |
| `MATCH_STUDIO_TEST_PLAN.md` | Required tests per milestone |
| `MATCH_STUDIO_IMPLEMENTATION_STATUS.md` | Living status / M0 verification log |

Supporting prior evidence (not authoritative alone): `SYSTEM_*.md`, `MLBB_INTEGRATION_AUDIT.md`.
