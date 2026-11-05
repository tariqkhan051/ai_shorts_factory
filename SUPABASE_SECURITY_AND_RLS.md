# Supabase Security & RLS — Match Studio

**Milestone:** 9.3  
**Plan:** Free only — no paid security add-ons required.

---

## 1. Threat model (relevant)

| Threat | Control |
|---|---|
| User A reads User B Match Studio data | RLS `auth.uid() = user_id` on owner tables |
| User A mutates User B jobs / recordings | Same RLS + server `userId` filters |
| Browser obtains service role | Never expose `SUPABASE_SERVICE_ROLE_KEY` via `NEXT_PUBLIC_*` |
| Worker bypasses RLS | Explicit ownership asserts (`match-studio-ownership.ts`) |
| Path traversal on storage keys | `assertSafeStorageKey` + run-scoped prefix |
| Unauthenticated access | `requireUser()` on Match Studio mutations; RLS denies `auth.uid()` null |

Hiding UI controls is **not** security.

---

## 2. Client roles

| Client | Credentials | RLS |
|---|---|---|
| Browser / SSR cookie client | anon + user JWT | Enforced |
| Service role (web server privileged / media-worker) | `SUPABASE_SERVICE_ROLE_KEY` | **Bypassed** |
| SQL pool (`SUPABASE_DB_URL`) | DB password | Depends on role in URL (usually bypasses as postgres) |

Workers using service role or direct Postgres **must** call:

- `assertRunOwnedByUser`
- `assertSourceOwnedByUser`
- `assertJobOwnedByUser`
- `assertStorageKeyBelongsToRun`

before writing outputs or updating run status.

---

## 3. Table policies (migrations)

| Table | Policy pattern | Migration |
|---|---|---|
| `match_studio_runs` | owner all | `00013` |
| `match_sources` | owner all | `00009` |
| `match_analysis_jobs` | owner all | `00009` |
| `match_timelines` | owner all | `00010` |
| `match_events` | via timeline ownership | `00010` |
| `match_edit_plans` / `match_edits` | owner all | `00011` |
| `match_commentary_scripts` | owner all | `00014` |
| `workflow_jobs` | user SELECT + INSERT only; **no UPDATE** for JWT | `00003` |

`workflow_jobs` lease claim/complete/fail/cancel updates require service role or SQL superuser path.

---

## 4. Storage object references

- Metadata (`storage_key`, checksum, byte size) lives in Postgres under RLS.
- Bytes live in R2/local — not Supabase Storage for multi-GB VODs.
- Object keys must start with `users/{userId}/match-studio/{runId}/`.
- Signed upload URLs are short-lived and bound to that prefix (M9.4).

---

## 5. Auth integration

- Existing Supabase Auth kept (no blind migration).
- `PROJECT_STORE=memory` uses a fixed local user (dev only).
- Production: `PROJECT_STORE=supabase` + real sessions; expired sessions → `/login`.

---

## 6. Tests

Unit (always in CI):

- Migration SQL contains RLS enable + owner policies for Match Studio tables.
- Ownership helpers deny cross-user access and bad storage keys.

Live (optional):

```bash
MATCH_STUDIO_RLS_LIVE_TEST=true
# plus test JWTs / seeded run ids — see match-studio-rls.test.ts
```

CI does **not** require a live Free project.

---

## 7. Operator checklist

1. Apply migrations through `00014`.
2. Confirm RLS enabled in Dashboard → Authentication/Policies.
3. Confirm service role is only in server/worker env files.
4. Confirm `validate:env --production` passes.
5. Never auto-delete original recordings for quota.
