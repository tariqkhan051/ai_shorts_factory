# Phase 6 — Realtime Dashboard and PWA Notifications

## Goals

- Live dashboard refresh for production events
- Persisted in-app notifications
- Optional web push (VAPID)
- Installable PWA shell (manifest + service worker)

## Delivered

| Item                                 | Location                                               |
| ------------------------------------ | ------------------------------------------------------ |
| Notification store / hub / publisher | `packages/notification`                                |
| Notifications + push APIs / SSE      | `apps/web/src/app/api/notifications`, `api/push`       |
| Dashboard live banner + alerts       | `apps/web/src/app/page.tsx`                            |
| Notification center                  | `apps/web/src/components/notification-center.tsx`      |
| PWA manifest + SW                    | `apps/web/public/manifest.webmanifest`, `public/sw.js` |
| SQL migration                        | `packages/database/migrations/00002_notifications.sql` |

## Local flow

1. `pnpm build && pnpm dev:web`
2. Run mock generation or assemble — alerts appear in the header and dashboard
3. Settings → enable push if `VAPID_*` keys are set
4. Install / add to home screen via browser using the web manifest

Memory mode uses an in-process SSE hub. Supabase Realtime can replace the hub later when `PROJECT_STORE=supabase`.

## Acceptance

- [x] In-app notifications for generation/assembly outcomes
- [x] SSE-driven dashboard refresh
- [x] Notification center in app shell
- [x] PWA manifest + service worker registration
- [x] Optional web push gated on VAPID
- [x] Notifications schema migration

## Verification results

| Command             | Result |
| ------------------- | ------ |
| `pnpm test`         | Pass   |
| `pnpm typecheck`    | Pass   |
| `pnpm lint`         | Pass   |
| `pnpm build`        | Pass   |
| `pnpm format:check` | Pass   |

## Exact next step

Phase 7 — Hardening + deployment (see `phase-7.md`).
