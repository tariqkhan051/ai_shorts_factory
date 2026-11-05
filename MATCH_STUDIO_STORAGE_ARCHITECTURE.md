# Match Studio Storage Architecture

**Milestone:** 9.4  
**Cost rule:** Supabase Free must not hold multi-GB match media.

---

## Provider order

| Priority | Provider | Use |
|---|---|---|
| 1 | Cloudflare R2 (`STORAGE_PROVIDER=r2`) | Browser multipart upload + durable artifacts |
| 2 | Local filesystem (`STORAGE_PROVIDER=local`) | Dev / single-machine; path registration |
| 3 | Supabase Storage | Optional **≤50 MB** assets only — **not** VODs |

Memory storage is for unit tests only.

---

## What lives where

| Artifact | Store |
|---|---|
| Run / source / job / timeline metadata | Supabase Postgres |
| Original multi-GB recording | R2 or local path |
| Intermediate frames / audio extracts | Worker work dir (temp) + optional object keys |
| Full-match / Shorts outputs | R2 or local object storage |
| Output metadata / approval | Postgres |

Never duplicate large media between R2 and Supabase Storage.

---

## Browser upload (R2)

1. Server creates multipart upload for key  
   `users/{userId}/match-studio/{runId}/source/…`
2. Browser uploads parts via short-lived signed URLs (no R2 secrets in client).
3. Server completes multipart and **heads** the object.
4. Only after verification: create `match_sources` row (`storage_key`, `ingest_status=uploaded`).
5. Enqueue `MATCH_INGEST_PROBE` for worker-side probe when shared download is available.

Local path registration remains a first-class alternative and must not be labeled “cloud upload.”

---

## Security

- Keys validated with `assertSafeStorageKey` + `assertStorageKeyBelongsToRun`.
- Content-type / extension checks on session create.
- Abort multipart on cancel/failure.
- Original recording is never overwritten by renders (distinct output keys).

---

## Free-tier note

Supabase Free max file upload is **50 MB**. Match Studio must not route gameplay VODs through Supabase Storage on Free.
