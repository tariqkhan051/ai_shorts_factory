# Content Platform Architecture — Brand → Project → Video

**Status:** Phases A–G complete for memory + Supabase repository wiring (apply migration `00007` before supabase mode)  
**Last updated:** 2026-11-05  
**Supersedes conceptual model:** “one Project ≈ one video”

## 1. Current-state findings (pre-change)

| Area | Today |
| --- | --- |
| Domain unit | `projects` is the production unit (idea → screenplay → scenes → assembly) |
| Identity fields | `category`, `visual_style`, `language`, `target_audience` live on `projects` |
| Creative brief | `project_inputs` is 1:1 with `projects` |
| Workflow | `projects.workflow_state` drives the single-video pipeline |
| Characters | User-scoped + `project_characters`; optional `in_library` |
| Stories / scenes / jobs / outputs | All FK to `project_id` |
| Brands / social / distribution | Not present |
| Screenplay schema | `screenplay-v1` embeds characters inline; no project DNA version |

Working pipelines to preserve: ChatGPT import, character sync, Flow package, scene upload, credits, R2 assets, FFmpeg assembly, quality gates, mock/real isolation.

## 2. Target hierarchy

```text
Brand
 └── Projects
      ├── Project DNA (versioned)
      ├── Character Library
      ├── Environment Library
      ├── Reference Assets
      ├── Production Templates (later)
      ├── Videos
      │    ├── inherited DNA version + context snapshot
      │    ├── Screenplay / Scenes / Generation / Assembly
      │    └── Distribution records
      └── Social Account Destinations (M:N)

Social Accounts  (separate entity; Brand-associated; Project-eligible via join)
```

### Cardinality

| Relation | Cardinality |
| --- | --- |
| Brand → Projects | 1:N |
| Project → Videos | 1:N |
| Project ↔ Social Accounts | M:N (`project_social_accounts`) |
| Video → Distributions | 1:N |
| Social Account → Distributions | 1:N |
| Project → DNA versions | 1:N (immutable versions; pointer to current) |
| Video → DNA version | N:1 (recorded at create / explicit refresh) |

## 3. Entity model

### Brand
- `id`, `user_id`, `name`, `description`, `logo_asset_id`, `colors` (jsonb), `default_watermark_asset_id`, `target_audience`, `brand_voice`, timestamps, soft delete

### Project (persistent content brand / niche / universe)
- Keeps existing row identity and scene/story FK compatibility during migration
- Adds: `brand_id`, `niche`, `content_purpose`, `universe_context`, `dna_current_version`, `legacy_single_video` flag
- Surface fields (`category`, `visual_style`, …) seed / mirror current DNA for backward reads

### Project DNA version
- Immutable row: `project_id`, `version` (int), `snapshot` (jsonb), `created_by`, `created_at`, `note`
- Snapshot sections: identity, visual, storytelling, production_defaults, prompt_instructions
- Mutations create a new version; never rewrite prior versions

### Video (production unit)
- `project_id`, `title`, `concept`, `story_brief`, `special_instructions`
- `workflow_state`, `captions_on_video`
- `project_dna_version`, `context_snapshot` (compact inherited subset, not full DNA dump when reference suffices)
- `approved_at`, assembly/publishing metadata pointers
- Owns the creative brief formerly on `project_inputs` for new work

### Character / Environment libraries
- Scope: **project** (not global-only)
- Characters keep stable IDs; screenplay proposes new temps; approval promotes to library
- Environments: locations, rooms, landscapes, props with references + continuity + usage history
- Reference assets remain content-addressed (SHA-256); videos reference, do not duplicate bytes

### Social Account
- Platform enum: youtube | facebook | Instagram | tiktok
- Display name, handle, `brand_id`, connection_status (`registered` \| `connected` \| `error` \| `revoked`)
- Publishing capability gated separately (`publishing_enabled` default false)
- Secrets via secure-secret storage abstraction (never in list/detail JSON)

### Distribution
- Per (video, social_account): caption, hashtags, format, schedule, status, published URL, platform ref, failure/retry
- Master assembly immutable; platform variants are derived distribution assets

## 4. Compatibility / migration strategy

1. **Do not rename** existing `projects` table or invalidate scene/story IDs.
2. Migration `00007_content_platform.sql`:
   - Create `brands`, `project_dna_versions`, `videos`, `environments`, `social_accounts`, `project_social_accounts`, `video_distributions`, secret stubs.
   - For each user without a brand: create `Personal` brand.
   - Assign every project to that brand (`brand_id`).
   - For each existing project: insert one `videos` row from `project_inputs` + `workflow_state` + `captions_on_video`; set `legacy_single_video = true`.
   - Seed DNA version `1` from current project identity fields.
   - Add nullable `video_id` to `stories`, `scenes`, `generation_jobs`, `generated_assets`, `video_outputs`, `approvals`, `workflow_jobs`, `credit_ledger`, `notifications`; backfill from legacy video.
3. **Compatibility shim** (Phase A–D):
   - Project detail routes continue to work; if `legacy_single_video`, production tabs resolve the single video automatically.
   - `createProject` with an idea still creates Project + Video #1 (legacy UX).
   - New UX: Create Project (DNA only) → Create New Video (concept only).
4. Mock vs real assets: migration never rewrites storage keys or provider provenance.
5. Credit ledger rows keep `project_id`; gain optional `video_id` for isolation.

## 5. Screenplay evolution

- Keep accepting `screenplay-v1`.
- Soft-extend with optional `project_context`, `character_usage`, `proposed_new_characters`, `environment_ids`.
- Import path: resolve existing character IDs; queue proposed characters for approval; never silently mutate library visual identity.
- Prompt builder injects DNA + library catalogs; still copy/paste ChatGPT website only.

## 6. Implementation phases

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **A** | Brand / Project / Video domain separation + migration + memory repos | Types, SQL, memory CRUD, migrate-existing tests green |
| **B** | Project DNA versioning + video inheritance snapshots | Version bump does not mutate approved videos |
| **C** | Project-scoped character + environment libraries | Reuse across videos; proposal/approval path |
| **D** | New-video workflow + prompt builder | Idea-only create; DNA/library injected into prompt |
| **E** | Social accounts + distribution records | Multi-destination per video; no fake “connected” |
| **F** | Project dashboard + nav | Progressive disclosure; Create New Video primary CTA |
| **G** | Supabase repos + wiring + mapper/regression tests | Create project/video works in both stores; secrets redacted |

## 7. Non-goals (this initiative)

- Paid ChatGPT API
- Unauthorized scraping / simulated social login
- Automatic publishing until an official gated integration exists
- Rewriting FFmpeg / Flow worker internals beyond `video_id` plumbing
