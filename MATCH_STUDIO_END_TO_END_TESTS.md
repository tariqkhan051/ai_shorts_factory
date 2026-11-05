# Match Studio End-to-End Tests

**Milestone:** 9.9

---

## Local memory path (CI default)

`packages/database/src/match-studio-e2e.test.ts` covers:

1. Create Match Studio run (MLBB Original + known patch)
2. Register recording metadata (`local_path` + `storage_key`)
3. Persist timeline + human correction
4. Persist commentary script (mock)
5. Enqueue `MATCH_RENDER_FULL` on `MemoryJobQueue`
6. Ownership deny for another user id

Run:

```bash
pnpm --filter @ai-shorts-factory/database test
```

Paid APIs are never called.

---

## Live Supabase path (optional)

Set:

```bash
MATCH_STUDIO_SUPABASE_E2E=true
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_DB_URL=...
```

Apply migrations through `00014`, then extend the skipped test in `match-studio-e2e.test.ts` / RLS live suite.

Without a Free test project, CI documents this limitation and keeps the skip.

---

## Worker render verification

`verifyMatchRenderOutput` in media-engine is used by media-worker after `MATCH_RENDER_*`. Failed verification never completes the job.
