# Phase 2 — ChatGPT Story Studio

## Goals

- Copyable ChatGPT production prompt (no paid API)
- JSON import with validation, schema versioning, readable errors
- Exactly five scenes; preserve prior work on failed imports
- Editable screenplay + character management
- Story approval advancing workflow to `SCENE_PREPARATION`

## Delivered

| Item                              | Location                               |
| --------------------------------- | -------------------------------------- |
| Prompt builder + import normalize | `packages/chatgpt-import`              |
| Sample five-scene screenplay      | `createSampleScreenplay()`             |
| Story/character repositories      | `packages/database`                    |
| Story Studio UI                   | `apps/web/src/app/projects/[id]/story` |

## Local flow

1. `pnpm build && pnpm dev:web`
2. Create a project
3. Open **Story Studio**
4. Copy Prompt → paste into ChatGPT website (manual)
5. Paste JSON back, or click **Load sample screenplay**
6. Edit scenes / characters
7. **Approve story**

## Acceptance

- [x] Prompt requests complete story, hook, 5 scenes, continuity, Flow prompts, overlays, transitions, publishing metadata
- [x] Copy Prompt button
- [x] JSON paste import + Zod validation + human-readable errors
- [x] Failed import does not destroy previous saved version
- [x] Editable five-scene screenplay
- [x] Character create/link/delete
- [x] Approve sets `approved_at` and workflow `SCENE_PREPARATION`

## Verification results

| Command             | Result |
| ------------------- | ------ |
| `pnpm test`         | Pass   |
| `pnpm typecheck`    | Pass   |
| `pnpm lint`         | Pass   |
| `pnpm build`        | Pass   |
| `pnpm format:check` | Pass   |

## Exact next step

Phase 3 — Credit engine + mock Flow sequential generation + job queue (done; see `phase-3.md`).
