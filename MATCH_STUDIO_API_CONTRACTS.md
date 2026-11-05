# Match Studio — API Contracts

**Milestone:** 0 (design only).  
**Convention:** Zod in `packages/validation`; server actions + thin route handlers in `apps/web`; workers claim typed jobs.

---

## 1. Existing contracts to keep

| Contract | Path | Use |
|---|---|---|
| Flow import media | `DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT` | Shorts/Flow only |
| Screenplay / DNA | `screenplay-v1`, `project-dna` | Shorts factory |
| Game KB import | `game-knowledge-import-v1` | KB JSON import |
| Ingest match (CLI) | `ingestMatchVideoSchema` | Extend in M1 for project_id / storage / unknown patch |
| HUD / analysis | `hudRecognitionConfigSchema` | Raise frame caps via match-only overrides |
| Events / commentary / edit | `match-events`, `match-commentary`, `match-edit` | Extend carefully with schema_version bumps |
| Job queue | `JobQueue` / `WORKFLOW_JOB_TYPES` | Extend types; add cancel |
| Spend flags | `matchSpendFlagsSchema` | TTS / vision gates |

---

## 2. New media contract (M2)

`MATCH_INGEST_MEDIA_CONTRACT` (proposed defaults — env-overridable):

| Field | Proposed default | Notes |
|---|---|---|
| maxUploadBytes | 8 GiB (configurable) | Not 256 MiB Flow default |
| minDurationSeconds | 60 | Reject accidental short clips misrouted |
| maxDurationSeconds | 7200 (2h) | Configurable |
| allowedVideoCodecs | h264, hevc (configurable) | Probe decides |
| requireAudio | false initially | Prefer true once audio pipeline ships |
| expectedAspect | soft guidance | Android may be 16:9 or 20:9 — **do not** force 9:16 on ingest |
| streaming | required | Never load full file into memory |

Validation: probe via FFprobe (`probeMedia`), corrupt → ingest_status failed.

---

## 3. Job types (extend `WORKFLOW_JOB_TYPES`)

Keep existing:

- `GENERATE_PROJECT_SCENES`, `RETRY_SCENE`, `VERIFY_SINGLE_SCENE`, `ASSEMBLE_PROJECT`

Add (M2+):

| Job type | Producer | Consumer | Idempotency key pattern |
|---|---|---|---|
| `MATCH_INGEST_PROBE` | web upload complete | media-worker | `match-ingest:{sourceId}:{checksum}` |
| `MATCH_ANALYZE_ROSTER` | user/auto after ingest | media-worker or web worker | `match-roster:{sourceId}:{cacheKey}` |
| `MATCH_ANALYZE_TIMELINE` | after roster or force | same | `match-timeline:{sourceId}:{cacheKey}` |
| `MATCH_ANALYZE_AUDIO` | optional stage | same | `match-audio:{sourceId}:{cacheKey}` |
| `MATCH_CORRELATE_EVENTS` | after visual+audio | same | `match-correlate:{timelineId}:v{n}` |
| `MATCH_GENERATE_COMMENTARY` | after timeline approve | web/worker | `match-commentary:{timelineId}:{style}` |
| `MATCH_SYNTHESIZE_VOICE` | after commentary approve | media-worker | `match-tts:{runId}:{scriptHash}` |
| `MATCH_BUILD_EDL` | after voice or skip-voice | worker | `match-edl:{timelineId}:{configHash}` |
| `MATCH_RENDER_FULL` | after EDL approve | media-worker | `match-render-full:{editId}` |
| `MATCH_RENDER_SHORTS` | after/with full | media-worker | `match-render-shorts:{editId}` |
| `MATCH_QUALITY_CHECK` | after renders | worker | `match-qc:{editId}` |

**JobQueue interface extension (M2):**

```ts
// Additive — design sketch
interface JobQueue {
  // existing: enqueue, claim, heartbeat, complete, fail, getById, listByProject
  cancel(jobId: string, actorId: string, reason?: string): Promise<void>;
  listByMatchSource?(matchSourceId: string): Promise<WorkflowJobRecord[]>;
}
```

Payload must include `matchSourceId`, `matchStudioRunId`, `projectId`, `userId`.

---

## 4. Provider interfaces (design sketches)

### 4.1 OCR (exists)

`createOcrProvider` in `packages/media-engine/src/ocr/create-ocr-provider.ts`  
Status: tesseract | scripted | paid_vision (throws until registered).

### 4.2 Audio event detector (M3 new)

```ts
type AudioEventDetectionInput = {
  audioOrVideoPath: string;
  workDir: string;
  serverEnvironment: 'original' | 'advance';
};

type AudioEventHit = {
  eventHint: string;
  timestampSeconds: number;
  confidence: number;
  evidenceRef: string;
};

interface AudioEventDetector {
  readonly status: 'ready' | 'unavailable' | 'stub';
  detect(input: AudioEventDetectionInput): Promise<AudioEventHit[]>;
}
```

Hits are **candidates**, not proof, until correlated.

### 4.3 TTS (M6 new)

```ts
type TtsSynthesizeInput = {
  text: string;
  voiceId: string;
  speed?: number;
  outputPath: string;
};

interface TtsProvider {
  readonly status: 'ready' | 'unconfigured' | 'disabled_by_spend_gate';
  listVoices(): Promise<{ id: string; label: string }[]>;
  synthesize(input: TtsSynthesizeInput): Promise<{ durationSeconds: number; byteSize: number }>;
  estimateCost?(chars: number): number | null;
}
```

If `status !== 'ready'`, Match Studio UI must show **Voice unavailable** and allow caption-only continue.

### 4.4 Commentary (extend existing)

Keep grounded builder; bump to segment-oriented schema (M5):

Proposed fields beyond today’s `matchCommentaryLineSchema`:

- `style`: `esports_caster` | `highlight_energetic` | `tactical_analyst` | `documentary`
- `start_seconds` / `end_seconds` (required for voice sync)
- `evidence_refs[]`, `knowledge_refs[]`
- `grounding_status`: `confirmed` | `cautious` | `omitted`
- `approval_status`: `draft` | `approved` | `rejected`

Preserve ChatGPT polish package import path (no OpenAI API assumption).

---

## 5. Web surface (proposed)

### Routes (App Router)

| Route | Milestone | Purpose |
|---|---|---|
| `/match-studio` | M1 | Dashboard of runs |
| `/match-studio/new` | M1 | Create project + env/patch + upload |
| `/match-studio/[runId]` | M1 | Overview + status |
| `/match-studio/[runId]/recording` | M2 | Metadata / probe |
| `/match-studio/[runId]/timeline` | M3 | Events + correction |
| `/match-studio/[runId]/commentary` | M5 | Review/edit lines |
| `/match-studio/[runId]/voice` | M6 | Preview/approve or unavailable |
| `/match-studio/[runId]/edl` | M6 | Editing decisions |
| `/match-studio/[runId]/outputs` | M7–M8 | Full + Shorts preview/export |

Keep `/match-analysis` as redirect or docs until M8 cleanup.  
Keep `/game-knowledge` for KB.

### Server actions (illustrative names)

- `createMatchStudioRunAction`
- `bindMatchPatchAction` / `markPatchUnknownAction`
- `uploadMatchRecordingAction` (or resumable upload session API)
- `startMatchAnalysisAction`
- `correctMatchEventAction`
- `approveTimelineAction`
- `generateMatchCommentaryAction`
- `importCommentaryPolishAction`
- `approveCommentaryAction`
- `synthesizeMatchVoiceAction` / `approveVoiceAction` / `skipVoiceAction`
- `buildMatchEdlAction` / `approveEdlAction`
- `renderMatchOutputsAction`
- `approveMatchOutputsAction`
- `confirmManualMatchPublishAction` (reuse distribution patterns)

### REST helpers

- `GET /api/match-studio/[runId]/status` — progress for UI polling/SSE
- `GET /api/match-studio/[runId]/original` — authorized stream/redirect
- `GET /api/match-studio/[runId]/outputs/[kind]` — full/short downloads
- Reuse notification SSE for stage changes

Auth: `requireUser()`; ownership via project.user_id.

---

## 6. CLI compatibility

Existing scripts remain valid during transition:

- `pnpm game-knowledge:import`
- `pnpm match:analyze-roster`
- `pnpm match:analyze-timeline`
- `pnpm match:commentary`
- `pnpm match:edit`
- `pnpm game-knowledge:sync`

M1+ should accept `--project-id` / `--run-id` flags when wiring studio runs. Do not delete CLIs.

---

## 7. n8n / publishing

- Publishing stays **manual confirmation** (`confirmManualPublishAction` pattern).
- Optional n8n events may emit `match.*.completed` later; not required for M1–M7.
- Never claim YouTube auto-upload.

---

## 8. Error contract

All actions return structured `{ ok, message, errors?, code? }` consistent with existing web action states.

Capability codes (examples):

- `TTS_UNAVAILABLE`
- `PATCH_UNKNOWN_LIMITS_COMMENTARY`
- `ENVIRONMENT_MISMATCH`
- `SPEND_BLOCKED`
- `INGEST_PROBE_FAILED`
- `JOB_CANCELLED`
