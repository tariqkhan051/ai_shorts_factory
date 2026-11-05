# Match Studio — Test Plan

**Milestone:** 0 (design).  
**Runner:** Vitest (existing monorepo).  
**CI rule:** `FLOW_PROVIDER=mock`; no paid APIs; no real Google Flow; no YouTube uploads.

---

## 1. Principles

1. Prefer unit/integration tests against Memory repositories + scripted OCR + mock TTS.
2. Use synthetic FFmpeg fixtures (color bars / drawtext) — **do not** commit copyrighted MLBB VODs.
3. Every milestone’s exit criteria include **tests that were executed** with recorded results in `MATCH_STUDIO_IMPLEMENTATION_STATUS.md`.
4. If shell execution is blocked, document the exact command and failure reason; never claim pass without execution.
5. Regression: existing shorts/Flow/assembly/n8n unit suites must still pass.

---

## 2. Existing tests to keep green

| Area | Examples |
|---|---|
| Workflow / queue | `memory-job-queue.test.ts`, `worker-restart.test.ts`, `sequential-generation-runner.test.ts` |
| Flow gates | `flow-live-gates.test.ts`, `create-provider.test.ts` |
| Media shorts | `assemble.test.ts`, `quality.test.ts`, `media-contract.test.ts` |
| Game KB / match | `game-knowledge*.test.ts`, `match-*.test.ts` in database/validation/media-engine |
| Web gates | `assembly-gate.test.ts`, n8n auth tests |

---

## 3. Tests by milestone

### Milestone 1 — Domain & lifecycle

| ID | Case | Package |
|---|---|---|
| M1-01 | Create Match Studio project (`gaming`) + run row | database |
| M1-02 | `match_sources.project_id` link + ownership | database |
| M1-03 | Bind published Original patch succeeds | database |
| M1-04 | Bind Advance patch to Original run throws `ENVIRONMENT_MISMATCH` | database |
| M1-05 | Explicit unknown patch allowed; capability flags set | validation + database |
| M1-06 | Status transitions reject illegal jumps | validation / database |
| M1-07 | Zod lifecycle parse rejects invalid status | validation |
| M1-08 | Memory + Supabase mapper parity (if supabase test harness exists; else memory only) | database |

### Milestone 2 — Ingest & durable jobs

| ID | Case | Package |
|---|---|---|
| M2-01 | `MATCH_INGEST_MEDIA_CONTRACT` accepts long duration; Flow contract still rejects >20s | media-engine |
| M2-02 | Probe populates duration/codecs; corrupt file fails ingest | media-engine |
| M2-03 | PostgresJobQueue enqueue idempotent | workflow-engine |
| M2-04 | Claim lease exclusive; expired lease reclaim | workflow-engine |
| M2-05 | `cancel` moves queued/leased→cancelled; worker stops | workflow-engine |
| M2-06 | Retry failed stage does not duplicate completed artifact (idempotency key) | workflow-engine + database |
| M2-07 | media-worker handles `MATCH_INGEST_PROBE` success path with mocks | apps/media-worker or integration |
| M2-08 | Shorts `ASSEMBLE_PROJECT` web path still works (regression) | apps/web / media-engine |

### Milestone 3 — Intelligence

| ID | Case | Package |
|---|---|---|
| M3-01 | Roster OCR maps heroes against published patch catalog | database |
| M3-02 | Timeline events include windows + confidence | database |
| M3-03 | Human correction sets `source=human` and preserves detector evidence | database |
| M3-04 | Audio detector stub returns `status=stub` without inventing kills | media-engine |
| M3-05 | Correlation merges audio+visual candidates with evidence refs | database |
| M3-06 | Low-confidence events stay non-approved until review | database |
| M3-07 | Scoreboard/minimap adapters report `not_implemented` (no false claims) | media-engine |

### Milestone 4 — Game Knowledge

| ID | Case | Package |
|---|---|---|
| M4-01 | JSON import idempotent for same patch_code+env+checksum | database |
| M4-02 | Re-import does not duplicate heroes | database |
| M4-03 | Draft cannot activate for commentary | database |
| M4-04 | Publish phrase required | database |
| M4-05 | Original filters experimental abilities | database |
| M4-06 | Diff against previous patch surfaces changes | database |
| M4-07 | Artifact sync never auto-publishes | database |

### Milestone 5 — Commentary

| ID | Case | Package |
|---|---|---|
| M5-01 | Lines without event_id cannot claim kill/ability as confirmed | validation + database |
| M5-02 | Ability mention blocked without evidence | database |
| M5-03 | Style field changes wording path but not allowed facts | database |
| M5-04 | Unknown patch → cautious/omitted ability claims | database |
| M5-05 | Polish package rejected if new event_ids invented | database / chatgpt-import |
| M5-06 | Segments include start/end for sync | validation |

### Milestone 6 — Voice & editing

| ID | Case | Package |
|---|---|---|
| M6-01 | TTS unconfigured → clear error; no empty silent “success” | media-engine / web |
| M6-02 | Spend gate blocks TTS when flag off | database match-spend |
| M6-03 | Mock TTS writes audio file + duration | media-engine |
| M6-04 | EDL decisions include reason + event refs | validation |
| M6-05 | Full-match render preserves major events (fixture timeline) | media-engine |
| M6-06 | Audio duck/mix when TTS present; caption-only path when skipped | media-engine |
| M6-07 | No black-frame / empty segment concat on fixture | media-engine |

### Milestone 7 — Shorts

| ID | Case | Package |
|---|---|---|
| M7-01 | Ranking prefers teamfight/lord over low-confidence kills | database match-edit-plan |
| M7-02 | Max 2 shorts; each ≤59s | validation + media-engine |
| M7-03 | Overlapping candidates deduped | database |
| M7-04 | Vertical 9:16 output dimensions | media-engine |
| M7-05 | Captions burned when enabled | media-engine |
| M7-06 | Reject/regenerate produces new idempotency key | workflow-engine |
| M7-07 | Generative shorts assemble still ≤59s (regression) | media-engine |

### Milestone 8 — UI & hardening

| ID | Case | Type |
|---|---|---|
| M8-01 | Status badges match run + job state | web component/unit |
| M8-02 | Failed stage shows retry | web |
| M8-03 | Cost/spend summary renders without secrets | web |
| M8-04 | Notification emitted on render complete | notification |
| M8-05 | Manual distribution confirm only | web |
| M8-06 | End-to-end memory-store happy path (synthetic media) | integration |
| M8-07 | OS selected never loads Advance abilities into prompt context | database |

---

## 4. Acceptance scenario mapping

Final acceptance (user journey) maps to tests:

| Step | Primary tests |
|---|---|
| Open Match Studio | M1-01, M8-01 |
| Select MLBB + Original | M1-03, M1-04, M8-07 |
| Known or unknown patch | M1-05, M5-04 |
| Upload recording | M2-01, M2-02 |
| Metadata + progress | M2-07, M8-01 |
| Review players/events | M3-01–M3-03 |
| Correct detections | M3-03 |
| Grounded commentary | M5-01–M5-05 |
| Voice preview/approve or unavailable | M6-01–M6-03 |
| Review EDL | M6-04 |
| Render full match | M6-05–M6-07 |
| Review 1–2 Shorts | M7-01–M7-05 |
| Approve/export | M8-05, existing distribution tests |

---

## 5. Commands to run (when executing milestones)

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @ai-shorts-factory/validation test
pnpm --filter @ai-shorts-factory/database test
pnpm --filter @ai-shorts-factory/media-engine test
pnpm --filter @ai-shorts-factory/workflow-engine test
```

CI already sets `FLOW_PROVIDER=mock` and disables flow-worker spend.

---

## 6. Milestone 0 test execution

**Not applicable** — Milestone 0 produces documentation only.  
No new tests added; no test suite executed as part of M0 deliverables (see status log).
