# Phase 5 — FFmpeg Assembly

## Goals

- Assemble five scene clips into one vertical short ≤ **59s**
- Target canvas **1080×1920** @ **30fps**
- Quality gates via ffprobe
- Honest upscaling notes (never claim native 1080p generation from lower sources)
- Media-worker smoke + web assemble path after `ASSEMBLY_READY`

## Delivered

| Item                               | Location                                          |
| ---------------------------------- | ------------------------------------------------- |
| Probe / synthesize / assemble / QC | `packages/media-engine`                           |
| Media worker + smoke               | `apps/media-worker`                               |
| Web assemble UI                    | `apps/web/src/app/projects/[id]/assemble`         |
| Shared storage for scene→final     | `getObjectStorage()` wired into generation runner |

## Local flow

1. Complete Story Studio → mock generation → `ASSEMBLY_READY`
2. Open **Assemble** → **Assemble with FFmpeg**
3. Or smoke worker:

```bash
MEDIA_WORKER_ENABLED=true MEDIA_WORKER_SMOKE=true pnpm --filter @ai-shorts-factory/media-worker start
```

Mock scene `.bin` placeholders are synthesized into color clips during assembly.

## Acceptance

- [x] FFmpeg concat + normalize to 1080×1920
- [x] Hard duration cap ≤ 59s
- [x] Quality gate failures block COMPLETED
- [x] Upscale honesty notes
- [x] Media-worker smoke assembly
- [x] Web assemble after five completed scenes

## Verification results

| Command             | Result |
| ------------------- | ------ |
| `pnpm test`         | Pass   |
| `pnpm typecheck`    | Pass   |
| `pnpm lint`         | Pass   |
| `pnpm build`        | Pass   |
| `pnpm format:check` | Pass   |

## Exact next step

Phase 6 — Realtime dashboard + PWA notifications (see `phase-6.md`).
