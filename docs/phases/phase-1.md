# Phase 1 — Database and Project Management

## Goals

- Supabase schema + RLS for core entities
- Auth integration (Supabase) with local memory fallback
- Project CRUD + idea submission
- Dashboard wired to real project stats
- Storage abstraction (R2 + memory)

## Delivered

| Item | Location |
|------|----------|
| SQL migration + RLS | `packages/database/migrations/00001_init.sql` |
| Project repository (memory + Supabase) | `packages/database` |
| Project Zod schemas | `packages/validation/src/project.ts` |
| Object storage (memory + R2) | `packages/storage` |
| Auth pages / session middleware | `apps/web/src/app/login`, `signup`, `middleware.ts` |
| Project list/create/detail | `apps/web/src/app/projects` |
| Dashboard stats | `apps/web/src/app/page.tsx` |

## Local usage (no cloud required)

```bash
# defaults to PROJECT_STORE=memory + STORAGE_PROVIDER=memory
pnpm install
pnpm --filter @ai-shorts-factory/database build
pnpm --filter @ai-shorts-factory/storage build
pnpm --filter @ai-shorts-factory/validation build
pnpm --filter @ai-shorts-factory/shared-types build
pnpm dev:web
```

Open `/projects/new`, create a project, edit it, soft-delete it.

## Supabase setup

1. Create a Supabase project.
2. Run `packages/database/migrations/00001_init.sql` in the SQL editor.
3. Set in `apps/web/.env.local`:

```env
PROJECT_STORE=supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # server only, not required for basic CRUD via user JWT
```

4. Restart `pnpm dev:web`, sign up at `/signup`, then create projects.

## R2 setup (optional in Phase 1)

```env
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=ai-shorts-factory
```

Without R2, the memory storage provider is used. Uploads UI expands in later phases; the abstraction and signed-URL helpers are ready.

## Acceptance criteria

- [x] Migrations for required tables with UUID PKs, FKs, indexes, RLS
- [x] Project create / list / update / soft-delete
- [x] Idea submission fields persisted with project
- [x] Auth path via Supabase (+ explicit memory local mode)
- [x] Storage interface with R2 + memory implementations
- [x] Service-role key never used in client components
- [x] Docs updated

## Out of scope (later phases)

- ChatGPT prompt/import (Phase 2)
- Credit ledger transactions (Phase 3)
- Google Flow automation (Phase 4)
- FFmpeg assembly (Phase 5)

## Exact next step

Phase 2 — ChatGPT Story Studio: prompt generator, JSON import, five-scene validation UI, character management, story approval.
