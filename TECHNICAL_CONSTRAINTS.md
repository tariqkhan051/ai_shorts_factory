# TECHNICAL CONSTRAINTS

Hard limits, assumptions, and isolation rules discovered from source (not aspirational docs alone).

---

## 1. Processing limitations

| Constraint | Value | Source |
|---|---|---|
| Scenes per shorts project | Exactly **5** (business default / schema unique 1–5) | `BUSINESS_DEFAULTS.sceneCount`, `scenes.scene_number` check |
| Sequential generation | One scene after another; live concurrency hard-capped at **1** | `maxSimultaneousLiveGenerations`, `live-generation-lock` |
| No automatic scene replacement | Failed/unknown submissions require human path | `SequentialGenerationRunner` comments/tests |
| Mock vs live separation | Web runner **always** wires `MockVideoGenerationProvider` | `apps/web/src/lib/generation/runtime.ts` |
| media-worker real jobs | Claimed `ASSEMBLE_PROJECT` **intentionally failed** | `apps/media-worker/src/index.ts` |
| Shared job queue | **Not implemented** — `MemoryJobQueue` per process | `workflow-engine`; Postgres `workflow_jobs` unused by TS |
| Blender / local GPU AI | Explicitly out of scope | `README.md` Safety rules; `docs/architecture.md` |
| Invented Flow HTTP APIs | Forbidden; UI automation or manual only | flow-adapter, README |

---

## 2. Video duration and format constraints

### Shorts factory (primary product)

| Limit | Value | Source |
|---|---|---|
| Final assembled video max | **59 seconds** | `BUSINESS_DEFAULTS.finalVideoMaxSeconds`; `quality.ts` |
| Target canvas | **1080×1920**, **30 fps**, 9:16 | `BUSINESS_DEFAULTS` |
| Default generated clip length | **8 seconds** | `defaultGenerationDurationSeconds` |
| DNA `target_duration_seconds` max | **59** | `projectDnaProductionDefaultsSchema` |
| DNA `scene_count` max | **5** | same schema |
| Manual Flow import duration | **1–20 seconds** | `DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT` |
| Manual Flow import size | **≤256 MiB** | same |
| Manual Flow codecs | **H.264** in mp4/mov family | same |
| Manual Flow min resolution | **720×1280** | same |
| Reference image upload | **≤15 MiB** | `apps/web/src/lib/characters/reference-image.ts` |
| Env `FINAL_VIDEO_*` | Present in `.env.example` but **not read by TS** assembly (uses constants) | audit finding |

### Match / MLBB track

| Limit | Value | Source |
|---|---|---|
| Condensed match edit max | default **180s**, schema max **600s** | `matchEditPlanConfigSchema.condensed_max_seconds` |
| Short candidate max | **≤59s**, up to **2** shorts | `short_max_seconds`, `max_shorts` |
| Frame sample default / max | default 3 / max **24** frames | `validation/match-analysis.ts` (per explore) |
| FFmpeg match-edit command timeouts | **120–180s** per command | `media-engine/src/match-edit.ts` |
| Source VOD duration | Stored on `match_sources.duration_seconds`; **no 59s hard reject on ingest** | `00009_match_analysis.sql` |
| Long Android recordings (30–60 min) | **Supported only as local file inputs to match CLIs**, not shorts assembly pipeline | ingest + CLI docs |

**Implication:** The main FFmpeg assemble path **cannot** emit 30–60 minute products. Long VODs must use the **match-edit** path (highlight/condense) or a new module.

---

## 3. Hardware assumptions

| Assumption | Evidence |
|---|---|
| CPU FFmpeg on operator machine / worker host | media-engine shells out to ffmpeg/ffprobe |
| No requirement for NVIDIA GPU in-repo | Safety rules forbid local GPU AI |
| Chromium/Chrome for live Flow | `FLOW_BROWSER_CHANNEL`, Playwright profile `.flow-profile` |
| Optional Tesseract installed for OCR | `TESSERACT_PATH`, `isTesseractAvailable()` |
| Dev can run without Supabase/R2 | `PROJECT_STORE=memory`, `STORAGE_PROVIDER=local` |
| Memory studio persistence on disk | `.data/memory-studio.json` pattern |

**CANNOT VERIFY** actual production host sizing from repository alone.

---

## 4. API and provider dependencies

| Provider | Dependency type | Gates |
|---|---|---|
| Supabase Auth + Postgres | Required for production store | `PROJECT_STORE=supabase`, migrations applied |
| Cloudflare R2 | Optional object storage | `STORAGE_PROVIDER=r2` + R2_* env |
| Google Flow (UI) | Optional live generation | Many `FLOW_*` gates + spend phrase + `FLOW_EXECUTE_LIVE` |
| ChatGPT | Operator browser only | No API key in app |
| n8n | Optional orchestration | `N8N_ENABLED` |
| Tesseract | Optional local OCR | Falls back to scripted empty OCR |
| Paid cloud vision | **Not registered** | Throws even if flag true |
| TTS / ElevenLabs / Kling / Runway / OpenAI | **Absent** | Spend flags default deny |
| YouTube Data API / Meta / TikTok | **Absent** | Manual distribution only |

Configuration variable names only (never secrets): see `.env.example` and `SYSTEM_DISCOVERY_REPORT.md` § AI inventory.

---

## 5. Costs and credit constraints

| Rule | Value | Source |
|---|---|---|
| Daily Flow credit budget | **50** | `dailyFlowCreditBudget` |
| Estimated cost per scene | **10** | `estimatedCostPerScene` |
| Max generations per project | **5** | `maxGenerationsPerProject` |
| Live canary max scenes | **1** until unlock | `canaryMaxLiveScenesPerProject`, `FLOW_CANARY_ONLY` |
| Live spend | Requires typed confirm phrase + tokens | `FLOW_SPEND_CONFIRM_*`, `FLOW_EXECUTE_LIVE` |
| Match paid vision/TTS | Default **disabled** | `MATCH_PAID_VISION_ENABLED`, `MATCH_TTS_SPEND_ENABLED` |
| CI | Must use `FLOW_PROVIDER=mock`, workers disabled | `.github/workflows/ci.yml` |

Credit ledger in app runtime is **file/memory** (`FileCreditLedger` / `MemoryCreditLedger`), not the Postgres `credit_ledger` table writer path for Flow spends.

---

## 6. Worker limitations

| Worker | Limitation |
|---|---|
| flow-worker | Separate memory queue; cannot claim web-enqueued jobs across processes |
| flow-worker + `google-flow-manual` | Exits without claiming (manual path is web HITL) |
| media-worker | Smoke OK; real `ASSEMBLE_PROJECT` fails pending shared adapters |
| Lease defaults | ~120s worker / ~300s web tick (env `WORKER_LEASE_SECONDS`) |
| Poll interval | `WORKER_POLL_INTERVAL_MS` default 2000 |
| Live Flow timeout | **600_000 ms** (10 min) per generation |
| Keepalive/smoke | Env-gated; not production orchestrators by themselves |

---

## 7. Storage constraints

| Mode | Behavior |
|---|---|
| `memory` | Ephemeral; tests |
| `local` (default durable) | `.data/objects` or `ASF_OBJECT_DIR` |
| `r2` | S3-compatible; signed URL TTL `R2_SIGNED_URL_TTL_SECONDS` |
| Project purge | `purgeProjectPrefix` lifecycle helpers |
| Match sources | Prefer `local_path` for CLI pipelines; `storage_key` optional |

No evidence of automatic lifecycle GC for multi-GB gameplay VODs.

---

## 8. Deployment limitations

| Topic | Constraint |
|---|---|
| Phase marker | `PHASE.current = 7` Hardening and Deployment |
| Deploy scripts | `scripts/deploy-web.ps1`, `deploy-workers.ps1` (Windows-oriented helpers) |
| Health | `GET /api/health`, `GET /api/ready` (ready gates store/R2/Flow) |
| Docker | Only optional n8n compose — **no full app container stack in-repo** |
| Multi-instance web | Memory queue / memory repos **will not cluster** correctly |
| Production store | Must use Supabase + proper RLS; memory mode unsuitable |
| Env validation | `pnpm validate:env` (+ production mode flag) |

---

## 9. Security and tenant isolation

| Control | Status |
|---|---|
| Multi-tenant organizations | **Not present** — isolation is **per user_id** |
| RLS on Postgres tables | Enabled in migrations for user-owned rows |
| Service role | Required for privileged job lease updates (comments in `00003`) |
| Memory store | No RLS — single-process trust |
| Secrets | `.env.example` documents; never commit real keys; Flow profile gitignored |
| n8n inbound | HMAC + Bearer secret helpers |
| Rate limit config | `API_RATE_LIMIT_PER_MINUTE` (verify wiring before relying) |
| Upload caps | `MAX_UPLOAD_BYTES` in env example (10 MiB default) vs Flow import 256 MiB contract — **two different caps** |
| Game KB publish | Human publish phrase; artifact sync never auto-publishes |
| Match commentary | Rejects unevidenced claims in validators |

---

## 10. Resource contention risks (shorts vs MLBB)

1. **Same FFmpeg host:** Long match renders (many seek/crop/concat ops) can starve shorts assembly if colocated without queues/quotas.
2. **Same Node process:** Inline web ticks for generation+assembly block request capacity under load.
3. **Disk:** Local `.data` + match work dirs + Flow diagnostic screenshots can grow without policy.
4. **Live Flow lock:** Global single live generation slot — cannot parallelize paid Flow with other live jobs.
5. **Credit ledger file:** Process-local file ledger is not a distributed budget authority.

**Recommendation for future MLBB work:** isolate match jobs on dedicated worker pool + durable queue; keep 59s shorts path on separate concurrency budget.
