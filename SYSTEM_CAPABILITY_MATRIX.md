# SYSTEM CAPABILITY MATRIX

Evidence-based status of AI Shorts Factory capabilities as of repository inspection (2026-11-05).  
Status values: **FULLY IMPLEMENTED AND OPERATIONAL** | **IMPLEMENTED BUT PARTIALLY FUNCTIONAL** | **UI IMPLEMENTED, BACKEND MISSING** | **BACKEND IMPLEMENTED, UI MISSING** | **MOCK OR SIMULATED** | **PLANNED BUT NOT IMPLEMENTED** | **CANNOT VERIFY**.

| Capability | Status | Evidence | Existing implementation | Missing work |
|---|---|---|---|---|
| User auth (Supabase) | IMPLEMENTED BUT PARTIALLY FUNCTIONAL | `apps/web/src/lib/auth.ts`, `middleware.ts`, login/signup | Password auth + OAuth callback; memory mode bypasses auth with fixed dev user | Org/tenant RBAC; middleware does not globally protect routes |
| Organizations / tenants / workspaces | PLANNED BUT NOT IMPLEMENTED | No `organization`/`tenant` tables in migrations | User-scoped rows (`user_id`) + RLS | Multi-tenant org model |
| Brand management | FULLY IMPLEMENTED AND OPERATIONAL | `00007_content_platform.sql`, `/brands`, `create-brand-form.tsx` | CRUD brands with colors, logo/watermark refs | CANNOT VERIFY production RLS without live Supabase |
| Project management | FULLY IMPLEMENTED AND OPERATIONAL | `projects` table, `content-platform-service.ts`, project pages | Create/edit/delete, workflow_state, soft delete | — |
| Project DNA + versioning | FULLY IMPLEMENTED AND OPERATIONAL | `project_dna_versions`, `validation/project-dna.ts`, DNA page | Append-only versions; videos pin DNA version | Not a general knowledge base |
| Character library | FULLY IMPLEMENTED AND OPERATIONAL | `00005_character_bible.sql`, character repos, `/characters` | Library flag, versions, reference images, screenplay sync | — |
| Environment library | FULLY IMPLEMENTED AND OPERATIONAL | `environments` table, project environments page | Project-scoped active environments in prompts | Cross-project env library |
| Reference / asset storage | FULLY IMPLEMENTED AND OPERATIONAL | `reference_assets`, `packages/storage` | Local / R2 / memory object storage | Shared durable queue with storage adapters for media-worker |
| Script / screenplay generation | IMPLEMENTED BUT PARTIALLY FUNCTIONAL | `chatgpt-import`, story page | Copyable ChatGPT prompt + JSON import; no OpenAI API | Automated LLM API if desired |
| Storyboard generation | PLANNED BUT NOT IMPLEMENTED | No storyboard entity | Scenes derived from screenplay JSON | Dedicated storyboard UI/model |
| Scene generation (mock) | MOCK OR SIMULATED | `MockVideoGenerationProvider`, web `runtime.ts` | Sequential mock scenes + credit reserve | — |
| Scene generation (live Flow) | IMPLEMENTED BUT PARTIALLY FUNCTIONAL | `GoogleFlowPlaywrightProvider`, flow-worker, live gates | Gated Playwright canary; manual upload path | Shared job queue; full multi-scene unlock |
| Video assembly (shorts) | FULLY IMPLEMENTED AND OPERATIONAL | `media-engine/assemble.ts`, assemble actions | FFmpeg normalize/concat/captions ≤59s 1080×1920 | media-worker does not process real jobs |
| Captions / subtitles | FULLY IMPLEMENTED AND OPERATIONAL | `captions.ts`, DNA `captions_on_video`, match caption builders | SRT burn-in for shorts + match edits | Separate soft-sub track export optional |
| Audio / music generation | PLANNED BUT NOT IMPLEMENTED | Screenplay `audio_direction` text only | Metadata fields | Music generation / library mix |
| Voice / TTS | PLANNED BUT NOT IMPLEMENTED | `MATCH_TTS_SPEND_ENABLED` gate only; no SDK | Spend denial by default | TTS provider adapter |
| Approval workflows | IMPLEMENTED BUT PARTIALLY FUNCTIONAL | Story approve; assembly gate; match `APPROVE_MATCH_DISTRIBUTION`; `approvals` table | Human gates for story/manual Flow/match | Full `FINAL_APPROVAL` product UI incomplete |
| Job management | IMPLEMENTED BUT PARTIALLY FUNCTIONAL | `MemoryJobQueue`, `workflow_jobs` SQL | In-process queue + schema for Postgres | No `SupabaseJobQueue` adapter |
| Worker management | IMPLEMENTED BUT PARTIALLY FUNCTIONAL | flow-worker / media-worker entrypoints | Claim loops, leases, smoke modes | Shared queue; media-worker fails real assemble jobs |
| Scheduling (publish) | UI IMPLEMENTED / SCHEMA ONLY | `scheduled_at` in distribution validation | Status field exists | No scheduler worker / cron |
| Publishing (YouTube/social) | IMPLEMENTED BUT PARTIALLY FUNCTIONAL | distribution actions, social accounts | Manual confirm with URL | No YouTube/Instagram/Facebook/TikTok APIs |
| Analytics | IMPLEMENTED BUT PARTIALLY FUNCTIONAL | `match-cache-metrics.ts` | Match OCR cache hit/miss | Product analytics dashboard |
| Usage / credits | FULLY IMPLEMENTED AND OPERATIONAL | `credit-manager`, file/memory ledger | Reserve/confirm/release; live spend phrase | Postgres ledger not wired to TS ledger |
| Settings | IMPLEMENTED BUT PARTIALLY FUNCTIONAL | `/settings` page | Env/store mode display | Rich settings CRUD vs `system_settings` |
| Notifications | FULLY IMPLEMENTED AND OPERATIONAL | `packages/notification`, SSE, VAPID routes | In-app + optional web push | CANNOT VERIFY push delivery without VAPID keys |
| Error / intervention handling | FULLY IMPLEMENTED AND OPERATIONAL | scene states, `NEEDS_HUMAN_INTERVENTION`, no blind retry | Live unknown submission gates | — |
| n8n orchestration | IMPLEMENTED BUT PARTIALLY FUNCTIONAL | `n8n-integration`, docker compose, automation page | Signed webhooks when enabled | Optional; Flow automation explicitly false |
| Library page | UI IMPLEMENTED, BACKEND MISSING | `/library` placeholder | Empty state | Asset browser productization |
| Game knowledge (MLBB KB) | FULLY IMPLEMENTED AND OPERATIONAL (CLI+UI import) | `00008`, game-knowledge pages/scripts | Import/publish patches, OS/AS separation | Auto Moonton feed |
| Match ingest | BACKEND IMPLEMENTED, UI MISSING | `ingestMatchVideo`, `match_sources` | Local path ingest + checksum | Full web upload UX |
| Roster OCR | BACKEND IMPLEMENTED, UI MISSING | `match-analysis-pipeline.ts`, Tesseract | Frame sample + crop + hero match | Robust HUD models; paid vision adapter |
| Event timeline | BACKEND IMPLEMENTED, UI MISSING | `match-event-pipeline.ts`, CLIs | Kill/objective candidates + corrections | Continuous long-match sampling UI |
| Grounded commentary | BACKEND IMPLEMENTED, UI MISSING | `match-commentary-service.ts` | Evidence-validated scripts + ChatGPT polish prompt | TTS + sync |
| Match edit / Shorts | BACKEND IMPLEMENTED, UI MISSING | `match-edit.ts`, `renderMatchEdit` | Condensed + ≤2 Shorts ≤59s | Production QC on real MLBB VODs |
| Android long-form (30–60 min) ingest for shorts factory | PLANNED BUT NOT IMPLEMENTED | Flow import max 20s; final ≤59s | Match path accepts local files with duration field | Dedicated long-form pipeline in web workers |
| Minimap / scoreboard CV | PLANNED BUT NOT IMPLEMENTED | Event types omit scoreboard/minimap | Kill-feed OCR oriented | Specialized detectors |
| Embeddings / vector search | PLANNED BUT NOT IMPLEMENTED | No vector package | — | RAG if needed |
| Blender | PLANNED BUT NOT IMPLEMENTED (explicit non-goal) | README safety rules | — | Keep out unless required |
| Unit test suite presence | FULLY IMPLEMENTED AND OPERATIONAL | ~50+ unique `*.test.ts` + CI | Vitest across packages | Live E2E against Flow/YouTube absent by design |
| Test run in this audit session | CANNOT VERIFY | Shell test commands rejected by environment classifier | CI config runs `pnpm test` with mock Flow | Re-run locally: `pnpm test` |
