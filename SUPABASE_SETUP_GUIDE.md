# Supabase Setup Guide (Free plan)

Target: **$0/month** Free project for Match Studio + Shorts Factory persistence.  
Read `SUPABASE_FREE_TIER_LIMITATIONS.md` before storing any media.

---

## 1. Create a Free Supabase project

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Create an organization on the **Free** plan (do not upgrade).
3. Create a project (you may have up to **2** active Free projects).
4. Choose a region close to your workers.
5. Save the database password in a password manager (needed for `SUPABASE_DB_URL`).

Do not enable paid add-ons (PITR, custom domain, Log Drains, Phone MFA, etc.).

---

## 2. Project URL and public key

Dashboard → **Project Settings → API**:

| Value | Env var(s) |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` (also accepts `SUPABASE_URL`) |
| `anon` / `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (also `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`) |

These are safe for the browser bundle.

---

## 3. Server-only credentials

| Credential | Env var | Where used |
|---|---|---|
| `service_role` secret | `SUPABASE_SERVICE_ROLE_KEY` | Workers, lease updates, privileged admin paths |
| Database connection string | `SUPABASE_DB_URL` (or `DATABASE_URL`) | Migrations (`psql`), `PostgresJobQueue` |

**Never** put `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_DB_URL` in `NEXT_PUBLIC_*` vars or client components.

Prefer the **connection pooler** URL for serverless Next.js; long-lived media-workers may use session mode or direct when using `FOR UPDATE SKIP LOCKED` (see worker architecture later). Keep pool size small on Free Nano (`SUPABASE_PG_POOL_MAX`, default 3).

---

## 4. Configure environment variables

Copy `.env.example` → `apps/web/.env.local` (and worker env files as needed):

```bash
PROJECT_STORE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_DB_URL=postgresql://postgres.YOUR_REF:YOUR_PASSWORD@...
STORAGE_PROVIDER=local   # or r2 for large Match Studio uploads
```

Local without Supabase:

```bash
PROJECT_STORE=memory
# Leave Supabase vars empty
```

Validate:

```bash
pnpm validate:env
pnpm validate:env -- --production   # requires Supabase + DB URL
```

---

## 5. Run migrations

Authoritative SQL lives in **one** place: `packages/database/migrations/` (`00001` … `00013`+).

List migrations:

```bash
pnpm db:migrate
```

Apply (requires `psql` + `SUPABASE_DB_URL`):

- Windows: `pwsh -File ./scripts/migrate.ps1`
- Unix: `bash ./scripts/migrate.sh`

Apply in filename order. Do not paste duplicate schema into the Dashboard SQL editor unless recovering a drift — prefer the scripts.

---

## 6. Generate database types (optional)

Zod contracts in `packages/validation` remain authoritative for app validation.

Optional codegen from a linked project:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_REF > packages/database/src/supabase.generated.ts
```

Do not commit secrets. Treat generated types as helpers only; keep repository mappers explicit.

---

## 7. Verify connectivity

1. Start web with `PROJECT_STORE=supabase` and public keys set.
2. Open `/login`, create/sign in a user (Auth → Users in Dashboard).
3. Create a Shorts project or Match Studio run — rows should appear under Table Editor (`projects`, later `match_studio_runs` once M9.2 lands).
4. Confirm Dashboard → Database shows applied tables from migrations.
5. Optional: `node -e` smoke using service client is available after M9.2 wiring; for M9.1, env readiness is exposed via `getAppEnv().supabaseReadiness`.

If the Free project **paused** after inactivity, restore it from the Dashboard before expecting queries to succeed.

---

## 8. Auth configuration

This repo already uses **Supabase Auth** (email/password + OAuth callback). Least-disruptive approach:

- Keep Auth as-is.
- `PROJECT_STORE=memory` continues to use the fixed local developer user (not for production).
- Protect mutating Match Studio routes with `requireUser()` (already used).
- Enable only Free-compatible Auth providers (email, social OAuth). Do not enable paid Phone MFA / SAML.

Dashboard → Authentication → Providers: configure as needed. Set Site URL to `APP_URL` (e.g. `http://localhost:3000`).

---

## 9. Configure RLS

Migrations already enable RLS and owner policies on Match Studio / match / content tables.

After applying migrations:

1. Confirm RLS is **enabled** on `match_studio_runs`, `match_sources`, `workflow_jobs`, etc.
2. Users authenticate with the **anon key + JWT**; service role is for workers only.
3. Full security model and tests: `SUPABASE_SECURITY_AND_RLS.md` (Milestone 9.3).

Never disable RLS to “make it work.”

---

## 10. Monitor Free-tier usage

Dashboard → Organization → **Usage**:

- Database size (500 MB)
- Storage (1 GB) — keep near empty for Match VODs
- Egress uncached / cached (5 GB each)
- Auth MAUs
- Edge Functions (should stay unused for video)

Also watch project **pause** state. See capacity section in `SUPABASE_FREE_TIER_LIMITATIONS.md`.

---

## 11. Run locally without Supabase

```bash
PROJECT_STORE=memory
STORAGE_PROVIDER=local
MATCH_JOB_QUEUE=file
```

- No Supabase URL required.
- Match Studio uses Memory repositories + FileJobQueue.
- Auth uses the deterministic local user.

Do **not** set `PROJECT_STORE=supabase` without credentials — the app must show an actionable error, not silently pretend data persisted.

---

## 12. Configure R2 for large browser uploads

Supabase Free Storage max file size is **50 MB**. For multi-GB recordings:

```bash
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=ai-shorts-factory
R2_SIGNED_URL_TTL_SECONDS=3600
```

Without R2, use **local path registration** and label it honestly (not “cloud upload”). Details in Milestone 9.4 / `MATCH_STUDIO_STORAGE_ARCHITECTURE.md`.

---

## Client separation (M9.1)

| Client | Module | Key |
|---|---|---|
| Browser | `apps/web/src/lib/supabase/client.ts` | anon / publishable |
| Server (SSR cookies) | `apps/web/src/lib/supabase/server.ts` | anon + user JWT |
| Service role | `apps/web/src/lib/supabase/service.ts` → `createServiceSupabaseClient` | service_role |
| SQL / queue | `packages/database` `createSqlQueryClient` | `SUPABASE_DB_URL` |

---

## Migration strategy

- **One** folder: `packages/database/migrations/`
- Additive numbered SQL only
- Application Zod schemas remain the validation source of truth
- Memory repositories stay for unit tests and `PROJECT_STORE=memory`
