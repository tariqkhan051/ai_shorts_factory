# Supabase Free Tier Limitations

**Purpose:** Hard constraints for Milestone 9 architecture. Target cost: **$0/month**.  
**Sources (verified 2026-11-05):**

- [Supabase Pricing](https://supabase.com/pricing)
- [Storage upload limits](https://supabase.com/docs/guides/storage/uploads/file-limits)
- [Manage egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
- [Billing on Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Edge Function limits](https://supabase.com/docs/guides/functions/limits)
- [Compute and disk / connection limits](https://supabase.com/docs/guides/platform/compute-and-disk)
- [Connection pooling](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)

Limits can change. Re-check the pricing page before assuming capacity.

---

## 1. Plan summary (Free — $0/month)

| Resource | Free allowance | Architectural implication |
|---|---|---|
| Active free projects | **2** (paused projects do not count) | One prod + one optional staging max |
| Database size | **500 MB** per project | Metadata only; never store video blobs in Postgres |
| File storage | **1 GB** included | Not enough for match VODs; optional small assets only |
| Max individual upload (Storage) | **50 MB** | **Forbid** multi-GB recordings via Supabase Storage |
| Uncached egress | **5 GB** / month | Prefer R2/local for media downloads |
| Cached egress | **5 GB** / month (separate quota) | Same — avoid serving large media from Supabase |
| MAUs (Auth) | **50,000** | Adequate for personal/operator use |
| API requests | Unlimited | OK |
| Automatic backups | **Not included** | Manual `pg_dump` / export discipline required |
| Point-in-time recovery | Paid add-on | Do not enable |
| Project pause | After **1 week** inactivity | Keep a heartbeat or accept restore latency |
| Restore window after pause | Documented platform window (dashboard); long-paused backups expire | Do not treat Free as HA production without ops awareness |
| Community support only | Yes | No paid support / SLAs |

---

## 2. Database & connections (Free / Nano)

Free projects run on **Nano** compute (shared CPU, ~500 MB RAM class).

| Limit | Typical Free (Nano) value | Implication |
|---|---|---|
| Direct DB max connections | **60** | Prefer pooler for serverless; one long-lived worker client OK |
| Pooler max clients | **200** | Shared Supavisor |
| Default pool size | **15** | Keep worker + web connection counts modest |
| Dedicated pooler (PgBouncer) | Paid compute sizes | Do not require dedicated pooler |

**Rule:** Use `SUPABASE_DB_URL` / pooler URL for `PostgresJobQueue` claiming. Do not open unbounded connections per request.

---

## 3. Auth (Free-compatible)

Included on Free without upgrade:

- Email/password, social OAuth, anonymous sign-ins
- Basic MFA
- Up to 50k MAUs

**Not on Free (do not enable):**

- Advanced MFA (Phone) — paid add-on
- SAML/SSO — paid
- Leaked password protection / single-session / custom session timeouts — Pro+
- Remove Supabase branding from emails — Pro+

**Repo decision:** Existing Supabase Auth path in `apps/web` is Free-compatible. Do not migrate Auth off Supabase; do not add paid Auth add-ons.

---

## 4. Storage (critical for Match Studio)

| Constraint | Value |
|---|---|
| Included storage | 1 GB |
| Global max file size (Free) | **50 MB** (cannot be raised on Free) |
| Image transformations | Not on Free |

**Hard product rule:**

> Android match recordings and full-match outputs **must not** use Supabase Storage as the primary object store.

Preferred order (already aligned with repo storage factory):

1. Cloudflare R2 (`STORAGE_PROVIDER=r2`) for large media when configured  
2. Local filesystem (`STORAGE_PROVIDER=local`) for dev / single-machine processing  
3. Optional Supabase Storage only for **≤50 MB** assets (thumbnails, small evidence frames, JSON exports) if ever needed  

Do not duplicate multi-GB objects between R2 and Supabase Storage.

---

## 5. Edge Functions (do not use for video)

| Limit | Free |
|---|---|
| Invocations | 500,000 / month |
| Wall-clock duration | **150 s** |
| Active CPU time | **2 s** per request |
| Memory | 256 MB |
| Max functions / project | 100 |

**Rule:** FFmpeg, OCR, audio analysis, and full-match render **must** run in `apps/media-worker` (or equivalent long-running process). Edge Functions are unsuitable and must not host Match Studio processing.

---

## 6. Realtime (optional, bounded)

| Limit | Free |
|---|---|
| Peak concurrent connections | **200** |
| Messages / month | **2 million** |
| Max message size | **256 KB** |

Realtime may help job-status updates later, but:

- Do not open unbounded subscriptions
- Prefer short-lived channels scoped to the authenticated user’s run
- Polling remains acceptable on Free to avoid connection pressure

---

## 7. Backups & recovery

- Free: **no automatic backups**
- Paid PITR / daily backups: **out of scope** (would break $0 target)

**Ops expectation:** Document manual SQL export and media-key inventory. Never delete original recordings to free Supabase quota.

---

## 8. What we will never enable for $0 compliance

- Pro/Team/Enterprise plan upgrade
- Compute upgrades beyond Free Nano
- PITR, custom domains, Log Drains, Image Transformations, Branching billing
- Phone MFA / SAML add-ons
- Automatic paid AI / vision / TTS activation (`MATCH_PAID_VISION_ENABLED`, `MATCH_TTS_SPEND_ENABLED` stay off unless user explicitly approves)

---

## 9. Usage monitoring (operators)

Monitor in Supabase Dashboard → Organization usage / project health:

1. Database size vs 500 MB  
2. Storage size vs 1 GB  
3. Uncached + cached egress vs 5 GB each  
4. Auth MAU  
5. Edge Function invocations (should stay near zero for Match Studio)  
6. Realtime connections (if enabled)  
7. Pause status / last activity  

Application should surface **actionable errors** when Postgres/store is unavailable (paused project, quota, misconfig) — never silently fall back to Memory in production (`PROJECT_STORE=supabase`).

---

## 10. Degradation policy

| Condition | Behavior |
|---|---|
| Supabase paused / unreachable | Fail closed with setup/recovery message; Memory only when `PROJECT_STORE=memory` |
| DB near 500 MB | Refuse large JSON dumps; purge **temp** artifacts only; never auto-delete originals |
| Supabase Storage full / file > 50 MB | Reject Supabase upload; require R2 or local path |
| Egress pressure | Serve media via R2/local signed URLs, not Supabase Storage CDN |
| Worker down | Show worker offline honestly; leave jobs queued |
| R2 missing | Keep local-path registration; label clearly as **not** browser cloud upload |
