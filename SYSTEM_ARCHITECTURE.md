# SYSTEM ARCHITECTURE

Evidence-based architecture diagrams and integration boundaries for **AI Shorts Factory** (`D:\repos\personal\ai_shorts_factory`).

---

## 1. High-level system architecture

```mermaid
flowchart TB
  subgraph Clients
    Browser[Browser / PWA]
    OperatorCLI[Operator CLIs pnpm match:* / game-knowledge:*]
  end

  subgraph WebApp["apps/web — Next.js 15 App Router"]
    UI[Pages + Components]
    SA[Server Actions]
    API[Route Handlers]
    Auth[Supabase Auth / Memory Dev User]
    InlineTick[processNextGenerationJob inline tick]
  end

  subgraph Packages["packages/* domain modules"]
    DB["database — Memory + Supabase repos"]
    WE["workflow-engine — MemoryJobQueue + SequentialGenerationRunner"]
    FA["flow-adapter — Mock / Manual / Playwright"]
    ME["media-engine — FFmpeg assemble / OCR / match-edit"]
    ST["storage — local / R2 / memory"]
    CM["credit-manager"]
    CI["chatgpt-import"]
    VAL["validation — Zod"]
    N8N["n8n-integration"]
    NOTIF["notification — SSE + push"]
  end

  subgraph Workers
    FW["apps/flow-worker"]
    MW["apps/media-worker"]
  end

  subgraph External
    Supabase[(Supabase Postgres + Auth)]
    R2[(Cloudflare R2)]
    FlowUI[Google Flow UI via Playwright]
    ChatGPTWeb[ChatGPT website — operator]
    N8nSvc[Optional n8n]
    Tesseract[Tesseract CLI]
    FFmpeg[FFmpeg / FFprobe]
  end

  Browser --> UI
  UI --> SA
  UI --> API
  SA --> Auth
  SA --> DB
  SA --> CI
  API --> InlineTick
  InlineTick --> WE
  InlineTick --> FA
  InlineTick --> ME
  InlineTick --> ST
  InlineTick --> CM
  InlineTick --> NOTIF
  DB --> Supabase
  ST --> R2
  FW --> FA
  FW --> WE
  FA --> FlowUI
  ME --> FFmpeg
  ME --> Tesseract
  OperatorCLI --> DB
  OperatorCLI --> ME
  SA --> N8N
  N8N --> N8nSvc
  CI -.-> ChatGPTWeb
```

**Key architectural facts**

- Primary product path is a **modular monolith** in `apps/web` with in-process job ticks.
- Workers exist but use **separate process-local** `MemoryJobQueue` instances — they do not share the web queue.
- `workflow_jobs` Postgres table exists; **no TypeScript Supabase queue adapter** is present.
- MLBB match intelligence is a **parallel subsystem** (packages + CLIs + docs UI), not wired into the 5-scene Flow project lifecycle.

---

## 2. Video-generation workflow (shorts factory)

```mermaid
sequenceDiagram
  actor User
  participant Story as Story UI / actions
  participant DNA as Project DNA
  participant Gen as Generate API / actions
  participant Q as MemoryJobQueue
  participant Runner as SequentialGenerationRunner
  participant Prov as Mock or Playwright Provider
  participant Store as ObjectStorage
  participant Asm as assembleProjectForUser
  participant FF as media-engine.assembleProject
  participant Dist as Distribution UI

  User->>DNA: Publish DNA version
  User->>Story: Copy ChatGPT prompt / import JSON
  Story->>Story: approveStoryAction
  User->>Gen: startMockGeneration OR manual Flow upload
  Gen->>Q: enqueue GENERATE_PROJECT_SCENES
  Gen->>Q: processNextGenerationJob
  Q->>Runner: runProject / retryScene
  Runner->>Prov: submitGeneration / wait / download
  Prov->>Store: scene asset bytes
  Runner->>Runner: VERIFYING_SCENES → ASSEMBLY_READY
  User->>Asm: startAssemblyAction
  Asm->>Q: enqueue ASSEMBLE_PROJECT
  Asm->>FF: assembleProject ≤59s 1080x1920
  FF-->>User: Final MP4 + publishing pack
  User->>Dist: Manual publish confirm (external YT/etc.)
```

**State machine (project):** `packages/database/src/workflow-transitions.ts`  
`IDEA_SUBMITTED` → story states → `READY_FOR_GENERATION` → `CREDIT_RESERVED` → `GENERATING_SCENES` → `VERIFYING_SCENES` → `ASSEMBLY_READY` → `ASSEMBLING` → `QUALITY_CHECK` → `COMPLETED` (optional `FINAL_APPROVAL` / `APPROVED`).

---

## 3. Job-processing workflow

```mermaid
stateDiagram-v2
  [*] --> queued: enqueue(idempotency_key)
  queued --> leased: claim(workerId, leaseSeconds)
  leased --> leased: heartbeat lease
  leased --> completed: complete(result)
  leased --> failed: fail(error)
  queued --> cancelled: cancel
  completed --> [*]
  failed --> [*]
  cancelled --> [*]
```

| Job type | Primary consumer | Notes |
|---|---|---|
| `GENERATE_PROJECT_SCENES` | web inline tick; flow-worker | Web always uses mock provider |
| `RETRY_SCENE` | flow-worker / runner | Payload includes scene number |
| `VERIFY_SINGLE_SCENE` | flow-worker canary | `maxScenes: 1` |
| `ASSEMBLE_PROJECT` | web media tick | media-worker **fails** real jobs pending shared adapters |

Sources: `packages/workflow-engine/src/job-types.ts`, `memory-job-queue.ts`, `apps/web/src/lib/generation/process-job.ts`, `apps/media-worker/src/index.ts`.

---

## 4. MLBB match-intelligence workflow (parallel)

```mermaid
flowchart LR
  VOD[Local match MP4] --> Ingest[ingestMatchVideo]
  Ingest --> Source[match_sources]
  Source --> Roster[analyze roster OCR]
  Source --> Timeline[analyze event timeline]
  KB[Published game_patches OS/AS] --> Roster
  KB --> Timeline
  Timeline --> Events[match_events + windows]
  Events --> Human[Human correction]
  Human --> Comm[generateGroundedMatchCommentary]
  Comm --> Edit[buildMatchEditPlan + renderMatchEdit]
  Edit --> Out[Condensed edit + ≤2 Shorts]
  Out --> Approve[APPROVE_MATCH_DISTRIBUTION]
```

Entry points: `scripts/analyze-match-roster.mjs`, `analyze-match-timeline.mjs`, `generate-match-commentary.mjs`, `assemble-match-edit.mjs`; libraries under `packages/database/src/match-*.ts` and `packages/media-engine`.

---

## 5. Database ER diagram (core + content platform + MLBB)

```mermaid
erDiagram
  users ||--o{ projects : owns
  users ||--o{ characters : owns
  users ||--o{ brands : owns
  users ||--o{ social_accounts : owns
  users ||--o{ game_profiles : owns
  users ||--o{ match_sources : owns
  brands ||--o{ projects : brands
  projects ||--|| project_inputs : has
  projects ||--o| stories : has
  stories ||--o{ story_versions : versions
  projects ||--o{ project_dna_versions : dna
  projects ||--o{ videos : contains
  projects ||--o{ environments : has
  projects ||--o{ scenes : has
  projects ||--o{ workflow_jobs : queues
  characters ||--o{ project_characters : linked
  characters ||--o{ character_versions : versions
  characters ||--o{ reference_assets : refs
  videos ||--o{ video_distributions : targets
  social_accounts ||--o{ video_distributions : account
  scenes ||--o{ generation_jobs : jobs
  scenes ||--o{ generated_assets : assets
  projects ||--o{ video_outputs : finals
  projects ||--o{ approvals : approvals
  users ||--o{ credit_ledger : ledger
  users ||--o{ notifications : alerts
  users ||--o{ push_subscriptions : push
  game_profiles ||--o{ game_server_profiles : OS_AS
  game_profiles ||--o{ game_patches : patches
  game_patches ||--o{ knowledge_sources : sources
  game_patches ||--o{ hero_knowledge : heroes
  hero_knowledge ||--o{ ability_knowledge : abilities
  match_sources ||--o{ match_analysis_jobs : analysis
  match_sources ||--o{ match_timelines : timelines
  match_timelines ||--o{ match_events : events
  match_timelines ||--o{ match_edit_plans : plans
  match_edit_plans ||--o{ match_edits : renders
```

Schema sources: `packages/database/migrations/00001_init.sql` … `00012_kb_sync_and_spend.sql`.

---

## 6. Integration boundaries

| Boundary | Inside system | Outside / operator | Contract |
|---|---|---|---|
| Story LLM | Prompt builder + Zod import | ChatGPT website | JSON screenplay-v1 |
| Video gen | Provider interface | Google Flow UI | Playwright recipe / manual upload |
| Credits | credit-manager ledger | Google Flow account balance | Reserve/confirm; live spend phrase |
| Object bytes | storage keys | Local disk or R2 | `createObjectStorage()` |
| Auth identity | `AppUser` | Supabase Auth | JWT cookies / memory bypass |
| Orchestration | Event emit | n8n workflows | HMAC webhooks |
| Match OCR | Frame sample + OCR provider | Tesseract binary / future vision API | `OcrProvider` |
| Publishing | Distribution records | YouTube/TikTok/etc. apps | Manual URL confirm |
| Game KB | Import/publish repos | Operator research JSON / artifact sync | Never auto-publishes |

---

## 7. Important dependencies (versions from manifests)

| Dependency | Version / note | Where |
|---|---|---|
| Node | ≥20 (`.nvmrc` = 20) | engines |
| pnpm | 9.15.0 | `packageManager` |
| Turborepo | ^2.3.3 | root `devDependencies` |
| TypeScript | ^5.7.2 | root + apps |
| Next.js | ^15.5.7 | `apps/web` |
| React | ^19.0.0 | `apps/web` |
| Tailwind | ^3.4.1 | `apps/web` |
| Zod | ^3.24.1 | web + validation |
| Vitest | ^2.1.8 | monorepo |
| `@supabase/ssr` / `supabase-js` | ^0.5.2 / ^2.49.1 | web |
| AWS S3 SDK (R2) | via `packages/storage` | R2 provider |
| Playwright | flow-adapter live path | Google Flow automation |
| n8n (Docker) | 1.72.1 | `docker/n8n/docker-compose.yml` |
| FFmpeg / FFprobe | system binaries | media-engine |
| Tesseract | system CLI optional | media-engine OCR |
| Prisma / Drizzle | **not used** | raw SQL migrations |

---

## 8. Recommended extension seams for MLBB productization

1. **Keep** shorts factory project workflow isolated; add match jobs as new `WORKFLOW_JOB_TYPES` rather than overloading `GENERATE_PROJECT_SCENES`.
2. **Reuse** `media-engine` (`sampleFramesAtTimestamps`, `cropNormalizedRegion`, `renderMatchEdit`, OCR factory).
3. **Reuse** game KB activation (`assertCanActivatePatch`) for OS vs Advance binding.
4. **Extend** storage + introduce durable queue before long VOD processing in workers.
5. **Do not** overload Project DNA with hero/patch facts — use `game_patches` / `hero_knowledge`.
6. **Publish** remains manual until real platform OAuth clients are added behind distribution statuses.
