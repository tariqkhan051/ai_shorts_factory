# MLBB Integration Audit

**Repository:** `ai_shorts_factory`  
**Audit date:** 2026-11-05  
**Scope:** Read-only technical assessment of whether the existing AI Shorts Factory can support persistent, patch-aware Mobile Legends: Bang Bang (MLBB) game intelligence for match analysis, commentary, and automated video editing.  
**Method:** Source-code and schema inspection of execution paths. Documentation used only as orientation; claims require code/schema evidence.  
**Restrictions observed (audit phase):** No code changes beyond this report, no dependency installs, no paid API calls, no voice generation, no video generation.

**Implementation progress (post-audit):**
- Milestone 1 (schema & activation) — `00008_game_knowledge.sql`, activation guards, Original/Advance bind/resolve separation.
- Milestone 2 (manual KB import) — `game-knowledge-import-v1` schema, diff engine, draft-only import, human publish phrase `PUBLISH_GAME_KNOWLEDGE`, CLI `scripts/import-game-knowledge.mjs`, UI `/game-knowledge`, sample Original/Advance fixtures under `assets/game-knowledge/`. No auto-sync from ChatGPT.
- Milestone 3 (match ingest + roster OCR MVP) — migration `00009_match_analysis.sql`, FFmpeg frame sample/crop, local OCR providers (scripted / optional tesseract; no paid vision), hero fuzzy-match against activated patch KB, analysis result cache, CLI `scripts/analyze-match-roster.mjs`.
- Milestone 4 (event timeline MVP) — migration `00010_match_event_timeline.sql`, kill/turtle/lord/turret/teamfight detection from kill-feed OCR, pre/main/post windows, human correct/add/reject, JSON export (`match-timeline-export-v1`), CLI `scripts/analyze-match-timeline.mjs`.
- Milestone 5 (grounded commentary) — `match-commentary-v1` evidence-bound scripts, validators rejecting unevidenced kills/players/abilities and Advance experimental leaks on Original, optional ChatGPT polish prompt/import that cannot invent facts, CLI `scripts/generate-match-commentary.mjs`.
- Milestone 6 (event-based edit + Shorts) — `match-edit-plan-v1` planner (pre/post pads + boring speed-up), FFmpeg vertical condensed edit + 1–2 Shorts with caption burn-in, longer condensed QC vs ≤59s Short gates, human phrase `APPROVE_MATCH_DISTRIBUTION` before distribution, CLI `scripts/assemble-match-edit.mjs`.
- Milestone 7 (optional automation & cost controls) — local artifact pull via `kb-artifact-sync-v1` (never auto-publishes, skips unchanged KB), spend flags default off (`MATCH_PAID_VISION_ENABLED` / `MATCH_TTS_SPEND_ENABLED`), credit-ledger wrappers for vision/TTS, roster/timeline cache metrics, CLI `scripts/sync-game-knowledge-artifacts.mjs`.

---

## A. Executive verdict

**ARCHITECTURALLY POSSIBLE BUT NOT IMPLEMENTED**

The repository is a **generative short-form content platform** (idea → ChatGPT screenplay JSON import → sequential Google Flow / mock scene generation → FFmpeg ≤59s vertical assembly → human review/download). It is **not** a gameplay intelligence, OCR, match-event, or live-commentary system.

Reusable foundations that *could* support an MLBB integration later:

- Brand → Project → Video hierarchy with **immutable Project DNA versions**
- Project-scoped **character bible** (version history + reference images) and **environment library**
- Structured **prompt injection** of project context into ChatGPT copy/paste prompts
- Human **approval gates** and workflow states
- Local **FFmpeg** assembly, caption burn-in, and media quality gates
- Worker/job-queue patterns for async work

Missing entirely (no modules, schemas, or execution paths):

- Game profiles / Original Server vs Advance Server separation
- Patch-versioned hero/skill knowledge bases
- Patch-note or Moonton source ingestion / sync
- Match-video OCR, HUD, hero, kill-feed, scoreboard, minimap, or audio event recognition
- Structured timestamped gameplay events with confidence scores
- Match commentary engine constrained by verified events + patch knowledge
- Event-based cutting of real match footage, boring-segment speed-up, full-match edit + Shorts selection from match analysis
- TTS / ElevenLabs / Blender / local vision models

**Bottom line:** Adjacent content-platform infrastructure is real and reusable. MLBB game intelligence itself is **not implemented**. Treating Project DNA or fictional characters as “heroes/patches” would be a misuse of current semantics.

---

## B. Existing capability matrix

| Capability | Status | Evidence/File | Explanation | Required action |
| --- | --- | --- | --- | --- |
| Multi-game / niche project profiles | PARTIALLY IMPLEMENTED | `packages/shared-types/src/workflow-states.ts` (`CONTENT_CATEGORIES` includes `gaming`); `packages/validation/src/project-dna.ts`; `docs/architecture.md` §1 | Projects have category, niche, universe_context, DNA. “MLBB” appears only as **test niche naming**, not a game profile schema. No game-rules / HUD-config objects. | Add explicit `GameProfile` entity (or DNA section) with terminology, rules, recognition configs. |
| Persistent knowledge across videos in a project | PARTIALLY IMPLEMENTED | `packages/database/migrations/00007_content_platform.sql` (`project_dna_versions`, `videos.context_snapshot`); `packages/database/src/dna-helpers.ts` | DNA + character/environment libraries persist across videos. Knowledge is **creative continuity**, not game mechanics. | Extend persistence model for game KB entities tied to project + environment + patch. |
| Hero identities as first-class game entities | NOT IMPLEMENTED | Character model in `00005_character_bible.sql`, `packages/database/src/story-types.ts` | Characters are narrative cast (name, visual identity, voice_description). No abilities, CC types, damage types, lanes, passives, ultimates. | New `heroes` / `hero_versions` schema distinct from fictional cast, or heavily specialized character subtype. |
| Hero portraits / visual references | PARTIALLY IMPLEMENTED | `reference_assets` in `00001_init.sql` / `00005_character_bible.sql`; `apps/web/src/lib/characters/reference-image.ts` | Reference image upload + primary asset for characters exists. Not hero-roster OCR templates or ability icons. | Reuse reference-asset storage; add hero/ability asset typing and recognition indexing. |
| Hero roles, lanes, skills, passives, ultimates, CC, damage types | NOT IMPLEMENTED | No matching tables/types under `packages/` | No ability graphs or combat mechanics model. | Design patch-scoped ability schema + validators. |
| Hero sound signatures | NOT IMPLEMENTED | — | `voice_description` is free text for character TTS *prompting*, not audio fingerprinting. | Optional audio signature store if recognition needs it. |
| Hero revamps / balance history | NOT IMPLEMENTED | `character_versions` is creative edit history, not patch changelog | Versioning pattern exists but semantics differ. | Patch-linked change records with server environment. |
| Player / gamer-tag extraction (OCR) | NOT IMPLEMENTED | No OCR package or HUD crop pipeline | Manual scene upload is for Flow clips (`manual-import.ts`), not scoreboard OCR. | Build OCR pipeline + player identity model. |
| Player↔hero mapping / team ID / cross-match history | NOT IMPLEMENTED | — | — | Add match roster + optional historical player registry. |
| Original Server vs Advance Server knowledge separation | NOT IMPLEMENTED | — | No environment enum for live vs advance; no runtime guard. | Mandatory `server_environment` + activation policy; hard fail on cross-use. |
| Patch ID, effective dates, historical patches | NOT IMPLEMENTED | DNA `version` is project creative version (`project_dna_versions.version`) | Not game patch IDs. | `game_patches` table with environment, dates, status. |
| Patch-note / hero ingestion from Moonton or research | NOT IMPLEMENTED | `packages/chatgpt-import` imports **screenplays** only | No patch JSON schema, webhook, or sync job. | Define import schema + API/CLI + verification workflow. |
| Duplicate / change detection for KB updates | NOT IMPLEMENTED | — | Checksums exist for **media** assets (`checksum_sha256`), not knowledge diffs. | Diff engine against previous patch KB. |
| Human approval before publishing KB | PARTIALLY IMPLEMENTED (pattern only) | Story approval / DNA `publishVersion` / `approvals` table | Approval UX exists for stories/DNA; **not** wired to game KB. | Reuse approval pattern for KB publish. |
| Scheduled / external sync of research into local KB | NOT IMPLEMENTED | Root `package.json` has no cron/sync; workers are Flow/media only | ChatGPT scheduled research **outside** the app does not reach the DB. | Explicit import API or file drop + operator approval. |
| OCR / HUD / kill-feed / scoreboard / minimap recognition | NOT IMPLEMENTED | No matches in source for OCR/HUD/kill-feed/minimap | — | New vision/OCR analysis worker. |
| Combat / skill / objective (Turtle/Lord/turret) detection | NOT IMPLEMENTED | — | — | Event detectors + ontology. |
| Audio event classification | NOT IMPLEMENTED | Media engine probes/mixes streams; no classifiers | README forbids local AI models by design. | Decide local vs API audio classification; policy change if local models needed. |
| Structured gameplay events (pre/main/post, confidence, timestamps) | NOT IMPLEMENTED | Screenplay scenes are creative beats, not match events | — | `MatchEvent` schema + timeline store. |
| Sequence / multi-frame understanding | NOT IMPLEMENTED | Scene pipeline is generative, frame-independent | — | Temporal event linker. |
| Commentary engine consuming verified events + patch KB | NOT IMPLEMENTED | `buildChatGptProductionPrompt` is showrunner/Flow prompt builder (`packages/chatgpt-import/src/prompt.ts`) | No anti-hallucination event grounding for kills/abilities/objectives. | New commentary prompt/builder with hard evidence constraints. |
| Runtime enforcement: never invent players/kills/abilities; never use Advance facts on Original | NOT IMPLEMENTED | Prompt says don’t invent crowd extras / don’t rewrite visual identity — **not** match-fact constraints | — | Structured evidence gates + prompt contracts + validators. |
| Event-based video cutting / boring segment speed-up | NOT IMPLEMENTED | `assembleProject` concatenates fixed scene clips (`packages/media-engine/src/assemble.ts`) | No match timeline editing. | New editor using event windows. |
| Full-match render + best 1–2 Shorts selection | NOT IMPLEMENTED | Business defaults: 5 scenes, ≤59s (`BUSINESS_DEFAULTS`) | Publishing pack is title/description/hashtags only (`publishing-pack.ts`). | Extend duration model + highlight selector. |
| Vertical 9:16 reframing | PARTIALLY IMPLEMENTED | `assemble.ts` `scalePadFilter` to 1080×1920 | Letterbox/pad of generated scenes, not smart subject tracking on match footage. | Optional smart reframe for gameplay sources. |
| Caption / subtitle burn-in | IMPLEMENTED | `packages/media-engine/src/captions.ts`; assembly `burnCaptions` | SRT from scene `text_overlay`; static style. Not animated kinetic captions. | Reuse; optionally enhance styling. |
| Voice / TTS generation | NOT IMPLEMENTED | No ElevenLabs/OpenAI TTS integration; README: paid APIs not enabled | Character `voice_description` is text metadata only. | Add TTS provider behind interface if commentary VO needed. |
| Game audio preserve + mix with commentary | NOT IMPLEMENTED | FFmpeg re-encodes scene audio to AAC stereo; no ducking/mix bus | — | Mix graph in media-engine. |
| Blender integration | NOT IMPLEMENTED | README / `docs/architecture.md`: Blender explicitly out of scope | — | Keep out unless product requires; prefer FFmpeg. |
| Quality control + human approval | PARTIALLY IMPLEMENTED | `evaluateQualityGates`; workflow states `QUALITY_CHECK`, `FINAL_APPROVAL`; story character review | Duration/resolution gates, not commentary factual accuracy QC. | Add evidence/confidence QC gates for match products. |
| Async workers / job queue | PARTIALLY IMPLEMENTED | `apps/flow-worker`, `apps/media-worker`, `packages/workflow-engine` | Generation + assembly jobs only. | Add analysis / KB-import job types. |
| Local economical processing | PARTIALLY IMPLEMENTED | FFmpeg/ffprobe local; Flow is cloud; no local vision | Frame sampling not present because analysis isn’t present. | Prefer local OCR/heuristics + selective vision; cache results. |
| Cache of analysis / reuse of unchanged hero KB | NOT IMPLEMENTED | R2/content-addressed assets for media | — | Cache event detections; immutable published KB versions. |
| GPU acceleration | NOT IMPLEMENTED (by design) | README: “No local GPU / local AI models” | Optional GPU not wired; FFmpeg may use system codecs. | Keep GPU optional; do not require upgrades without evidence. |

---

## C. Existing architecture mapping

### Current runtime (implemented)

```text
Browser (PWA / Next.js apps/web)
  → Project / Brand / DNA / Characters / Environments / Videos
  → ChatGPT prompt copy + JSON screenplay import (chatgpt-import)
  → Story approval + character sync
  → Sequential scene generation (flow-worker: mock | Playwright Flow)
  → Manual scene video upload (optional handoff)
  → FFmpeg assembly (media-worker / in-app assemble) → ≤59s 9:16 MP4
  → Quality gates → download / publishing pack text
  → Distribution records (manual publish status; auto-publish gated)
```

Key packages:

| Package / app | Role today | MLBB reuse potential |
| --- | --- | --- |
| `apps/web` | UI + server actions | Operator console for KB approval, match ingest UI |
| `apps/flow-worker` | AI scene generation | **Not** for match analysis; keep separate |
| `apps/media-worker` | FFmpeg assembly | Extend for event-based edits / mixing |
| `packages/database` | Supabase/memory repos, migrations | Extend schemas; reuse versioning/approval patterns |
| `packages/chatgpt-import` | Screenplay prompt + JSON normalize | Pattern for **separate** commentary/KB import modules |
| `packages/media-engine` | assemble, probe, captions, quality | Reuse FFmpeg plumbing |
| `packages/workflow-engine` | Job queue, sequential runner | New job kinds: analyze, kb_import, commentary |
| `packages/credit-manager` | Flow credit ledger | Optionally track paid vision/TTS spend |
| `packages/storage` | R2 abstraction | Store match sources, frames, KB artifacts |
| `packages/validation` / `shared-types` | Zod + enums | New MLBB schemas/enums |
| `packages/notification` | Alerts / SSE | Notify on KB update / analysis complete |

### Architectural gaps (blocking)

1. **Domain mismatch:** Pipeline assumes *authored* 5-scene shorts, not *observed* match timelines.
2. **No analysis plane:** No worker that reads gameplay video and emits events.
3. **No game KB plane:** No patch/environment-scoped facts with activation rules.
4. **No grounded commentary plane:** Prompts generate creative screenplays, not evidence-bound callouts.
5. **Duration / product model:** Hard-coded ~5×8s / ≤59s shorts vs full-match + highlight Shorts.
6. **Explicit non-goals:** Local GPU AI and Blender are designed out (`README.md` Safety rules).

---

## D. MLBB knowledge-base assessment

### What exists that looks similar

- **Project DNA (immutable versions):** `project_dna_versions` + `MemoryProjectDnaRepository.publishVersion` / Supabase equivalent. Good pattern for “publish a knowledge snapshot after human edit,” but snapshot shape is creative (`identity`, `visual`, `storytelling`, `production_defaults`, `prompt_instructions`) — see `packages/validation/src/project-dna.ts`.
- **Character bible + versions + references:** Persistent identities with visual lock and reference images. Closest analog to “hero portraits,” but fields are narrative (`role`, `clothing`, `voice_description`), not skills/CC/damage.
- **Environments:** Project-scoped locations including `battlefield` kind (`ENVIRONMENT_KINDS`). Useful for map/set dressing, **not** for Original vs Advance Server.
- **Universe context / niche free text:** Can store prose lore about MLBB, but free text cannot enforce patch isolation or ability truth.

### What does not exist

- Game → Server environment → Patch hierarchy
- Hero ability graphs linked to patches
- Player identity / roster / OCR-sourced tags
- Source provenance (Moonton URL, publication date, researcher, checksum of patch notes)
- Activation binding: “this match uses Original Server patch X”

**Verdict:** Persistent *creative* knowledge is supported. Persistent *MLBB game intelligence* is **not supported**. DNA/character versioning is a reusable **pattern**, not a substitute KB.

---

## E. Patch-update integration assessment

| Layer | Status | Evidence |
| --- | --- | --- |
| 1. Research capability | **Outside app** | Operators can use ChatGPT website; app only builds screenplay prompts (`buildChatGptProductionPrompt`). No MLBB research prompt/module. |
| 2. Data import capability | **Screenplay JSON only** | `normalizeImportedScreenplay` / Zod `screenplay-v1`. No patch-note or hero KB import schema. |
| 3. Automatic synchronization | **NOT IMPLEMENTED** | No cron, webhook, or sync worker. Root scripts are env validate, migrate, Flow inspect, deploy. |
| 4. Human approval | **Pattern exists; not for KB** | Story approval, DNA publish, `approvals` table, Flow human-intervention states. |
| 5. Runtime knowledge activation | **NOT IMPLEMENTED** | Videos pin `project_dna_version` for creative context (`videos.project_dna_version`). No `game_patch_id` / server environment pin for commentary. |

**Critical distinction (confirmed):** A ChatGPT scheduled research report does **not** update this application. There is no supported path from external research → local MLBB KB unless a new import/API is built.

**Original vs Advance enforcement:** Cannot be enforced at runtime today because the concepts do not exist in schema or prompt contracts. Mixing experimental Natalia Advance abilities into Original commentary is currently **unpreventable by system controls** (only by operator prose discipline).

---

## F. Commentary integration assessment

### Current “AI prompt” path

1. UI builds `PromptProjectContext` (`apps/web/src/lib/projects/prompt-context.ts`).
2. `buildChatGptProductionPrompt` asks for a **5-scene vertical short screenplay** + Flow prompts.
3. Operator pastes into ChatGPT website; imports JSON; human approves.
4. No paid ChatGPT API; no automated commentator loop.

### Can it consume structured MLBB knowledge + timestamped events?

**Not as implemented.** The prompt injects DNA, character library, environments, and idea text. It does **not**:

- Bind a patch/environment
- Accept a verified event timeline
- Require evidence IDs for kills/objectives/abilities
- Distinguish prediction vs confirmed fact
- Forbid inventing player names or assists

Existing soft constraints (“don’t invent crowd extras,” “don’t rewrite locked visual identity”) are **continuity** rules, not match-fact grounding.

### What would be required (design only)

- Structured `MatchEvent[]` + `GameKnowledgeSnapshot` inputs
- Validator rejecting commentary claims without evidence refs
- Separate prompt module (do not overload screenplay-v1)
- Optional post-check: claim extraction vs event store

---

## G. Video production assessment

### Reusable today

| Need | Module | Fit |
| --- | --- | --- |
| Vertical canvas normalize | `media-engine/assemble.ts` `scalePadFilter` | Good for Shorts export |
| Caption burn-in | `captions.ts` + libass subtitles filter | Good starting point |
| Probe / QC duration & resolution | `probe.ts`, `quality.ts` | Reuse; extend for longer form |
| Async media work | `apps/media-worker` | Reuse worker pattern |
| Human review before publish | Workflow + assemble UI + distribution statuses | Reuse |
| Publishing metadata | `publishing-pack.ts` | Titles/tags only |

### Not reusable without new design

| Need | Why missing |
| --- | --- |
| Cut on gameplay events with pre/post context | Assembly is ordered scene concat, not timeline edit |
| Remove/speed boring play | No gameplay boredom classifier or speed segments |
| Sync spoken commentary to events | No TTS; no A/V sync to event timestamps |
| Preserve match audio + mix VO | No mix bus / ducking |
| Full-match render | Cap ≤59s; 5 scenes |
| Auto-pick best 1–2 Shorts from analysis | No highlight scorer; one assembly output |
| Smart 9:16 reframe of MOBA FOV | Pad/scale only |

**Do not duplicate:** Keep `media-engine` as the FFmpeg home; extend with new functions rather than a parallel renderer. Keep Flow generation as an **optional cinematic B-roll path**, separate from match-edit path.

---

## H. Missing components (priority)

### Critical

1. **Game knowledge model** — Game → ServerEnvironment (Original | Advance) → Patch → Hero/Ability facts with provenance.
2. **Runtime activation binding** — Every match/analysis job declares environment + patch; commentary/editor refuse mismatched knowledge.
3. **Match analysis pipeline** — Ingest match video → frame/audio sampling → OCR/HUD/events → confidence-scored timeline.
4. **Evidence-bound commentary generator** — Consumes events + activated KB only; validators against invention.
5. **KB import + approval workflow** — Explicit path for monthly research/patch notes into draft → diff → human publish.

### High

6. **Event-based media editor** — Pre/main/post windows, boring speed-up, full match + Shorts derivation.
7. **Player/roster identity** — OCR gamer tags, hero mapping, optional cross-match history.
8. **Audio mix + optional TTS provider interface** (no spend until enabled).
9. **Analysis job types** in workflow-engine + media/analysis worker.
10. **QC gates for factual confidence** (not only resolution/duration).

### Medium

11. Hero visual template library for recognition (reuse `reference_assets`).
12. Cache layers for detections and published KB versions.
13. Distribution/publishing of match Shorts using existing brand/social records.
14. Operator UI for KB browser, patch compare, event timeline review.

### Low

15. Animated/kinetic subtitles beyond current SRT burn-in.
16. Smart subject tracking reframe.
17. Blender (not needed if FFmpeg covers graphics; architecture currently excludes it).
18. Local GPU acceleration (optional; only if measured need).

---

## I. Recommended integration architecture

Reuse the existing modular monolith; **add a parallel “Match Intelligence” plane** beside the generative Shorts plane. Do not force match replays through the 5-scene Flow screenplay state machine.

```text
Brand
 └── Project (e.g. MLBB Original content channel)
      ├── Project DNA (creative voice — existing)
      ├── GameKnowledgeBinding
      │    ├── game = MLBB
      │    ├── server_environment = original | advance
      │    └── active_patch_id (published KB version)
      ├── GameKnowledgeBase (new)
      │    └── patches[] → heroes/abilities/changes + sources
      ├── Character library (optional cinematic cast — existing)
      └── Videos / Matches (extend Video or add MatchProduction)
           ├── source_match_asset
           ├── analysis_job → MatchEventTimeline
           ├── commentary_job → script + optional TTS
           ├── edit_job → full_edit + shorts[]
           └── distribution (existing)
```

**Workers:**

- Keep `flow-worker` for generative scenes only.
- Extend `media-worker` (or add `analysis-worker`) for: frame extract, OCR, event fuse, FFmpeg edit/mix.
- Import path: `POST/CLI knowledge import` → draft patch → diff vs previous → human approve → publish → projects may activate.

**Prompting:**

- Keep `chatgpt-import` for cinematic Shorts.
- Add `match-commentary-import` (or API) with mandatory `event_id` citations and environment/patch header.

**Hard rule:** Advance Server KB never loads when `server_environment=original`.

---

## J. Implementation roadmap

*Do not implement without explicit approval. Milestones below are planning only.*

### Milestone 0 — Product contract

- **Deps:** None  
- **Deliverable:** Written acceptance criteria for Original-only matches, event confidence thresholds, Shorts count, commentary language.  
- **Accept:** Stakeholders sign environment-separation and anti-hallucination rules.

### Milestone 1 — Schema & activation

- **Deps:** M0  
- **Deliverable:** Migrations for `game_profiles`, `server_environments`, `game_patches`, `hero_knowledge`, `ability_knowledge`, `knowledge_sources`; video/match fields `server_environment`, `game_patch_id`.  
- **Accept:** Cannot attach Advance patch to Original match; published KB immutable; draft≠active.

### Milestone 2 — Manual KB import + approval

- **Deps:** M1  
- **Deliverable:** JSON schema for patch research import; CLI or admin upload; diff view; publish action reusing approval UX patterns.  
- **Accept:** Sample Original patch imported; Advance patch imported separately; publish requires human; no auto-sync assumed.

### Milestone 3 — Match ingest + baseline analysis (OCR/HUD MVP)

- **Deps:** M1  
- **Deliverable:** Upload match video to storage; sample frames; OCR loading/scoreboard regions; roster hero mapping with confidence; cache results.  
- **Accept:** On fixture footage, extract ≥N player tags/heroes with measured precision; no full-video paid vision by default.

### Milestone 4 — Event timeline MVP

- **Deps:** M3  
- **Deliverable:** Kill/objective/turret/teamfight candidates with timestamps, participants, confidence, evidence refs.  
- **Accept:** Human can correct timeline; export JSON; sequence linking (pre/main/post) for top event types.

### Milestone 5 — Grounded commentary

- **Deps:** M2, M4  
- **Deliverable:** Commentary builder using activated patch + events only; validators; optional ChatGPT copy/paste JSON import for wording polish **after** evidence binding.  
- **Accept:** Attempts to claim unevidenced kill/ability/objective fail validation; Advance abilities absent from Original commentary.

### Milestone 6 — Event-based edit + Shorts

- **Deps:** M4, M5 (TTS optional)  
- **Deliverable:** FFmpeg timeline cut with pre/post pads; boring speed-up heuristic; one full condensed edit + 1–2 Shorts; caption burn-in; quality gates updated for longer outputs.  
- **Accept:** Outputs sync to event timestamps; vertical export; human approval before distribution.

### Milestone 7 — Optional automation & cost controls

- **Deps:** M2–M6  
- **Deliverable:** Scheduled *pull* of operator-provided research artifacts (not inventing Moonton API); credit/spend ledger for any paid vision/TTS; caching metrics.  
- **Accept:** Sync never auto-publishes; spend flags default off; unchanged KB not reprocessed.

---

## K. Final recommendation

1. **Can the current system support MLBB match intelligence?**  
   **Not as-is.** Architecture can host it as a new plane; intelligence features are unimplemented.

2. **Can it maintain persistent hero and player knowledge?**  
   **Heroes/players as game entities: no.** Persistent creative characters/references: yes (wrong semantics for abilities/patches). Players/OCR identities: no.

3. **Can it distinguish live-server and Advance Server patches?**  
   **No.** No schema or runtime enforcement.

4. **Can it receive monthly patch updates?**  
   **No automatic path.** Manual creative JSON import exists for screenplays only. External ChatGPT research does not sync into the app.

5. **Can it use patch-specific information during commentary generation?**  
   **No.** No patch-scoped KB and no evidence-bound commentary engine.

6. **Can it produce a full edited match and one or two Shorts from analyzed events?**  
   **No.** It can assemble **five generated scenes** into one ≤59s Short with captions. Match event editing and multi-output highlight selection are absent.

7. **Minimum development effort to production-ready integration?**  
   Roughly **Milestones 1–6** above: new KB domain + import/approval, analysis/OCR event pipeline, grounded commentary, and FFmpeg event editor/Shorts — while reusing DNA/approval patterns, storage, workers, captions, and QC scaffolding.  
   Order-of-magnitude: a **multi-phase product initiative** (weeks to months depending on OCR accuracy targets and whether TTS/paid vision are in scope), **not** a thin config change on the current Shorts factory.

### Concise verdict

**ARCHITECTURALLY POSSIBLE BUT NOT IMPLEMENTED** — strong content-platform and FFmpeg foundations; zero MLBB game-intelligence implementation.

### Implementation roadmap status

Milestones **1–7** from this audit are implemented in-repo. Further work (live paid vision/TTS adapters, Postgres-backed sync workers, Moonton-adjacent feeds) is out of scope unless newly approved.
)
