# Match Studio Worker Architecture

**Milestone:** 9.5

---

## Principles

- Durable jobs prefer **Postgres `workflow_jobs`** (`MATCH_JOB_QUEUE=postgres` + `SUPABASE_DB_URL`).
- Dev default remains **FileJobQueue** (shared JSON path for web + worker).
- Processing runs in **`apps/media-worker`** (long-lived). Not Edge Functions.
- Web and worker must share the same queue mode and object storage provider.
- Cancelled jobs must not write final outputs (`JOB_CANCELLED` guard).

---

## Queue modes

| `MATCH_JOB_QUEUE` | Backend | When |
|---|---|---|
| `file` (default) | `.data/match-job-queue.json` | Local multi-process without Postgres |
| `memory` | In-process | Unit tests |
| `postgres` | `public.workflow_jobs` via `PostgresJobQueue` | Durable / restart-safe |

Claim uses `FOR UPDATE SKIP LOCKED`. Lease mutations require DB credentials that bypass JWT RLS (service role / DB URL).

---

## Worker handlers (media-worker)

| Job type | Behavior |
|---|---|
| `MATCH_INGEST_PROBE` | Probe local or downloaded storage object; validate Match ingest contract |
| `MATCH_ANALYZE_AUDIO` | Run audio detector; write hits JSON |
| `MATCH_SYNTHESIZE_VOICE` | Mock/configured TTS when spend gates allow |
| `MATCH_RENDER_FULL` | `renderFullMatch`; optional upload to `outputStorageKey` |
| `MATCH_RENDER_SHORTS` | `renderMatchEdit` profile `short` (≤59s); not Flow assemble |
| Analysis / EDL / commentary | Explicit fail pointing to services/CLIs until full deps wiring |

`ASSEMBLE_PROJECT` is rejected in Match Studio worker path (Shorts Factory remains on web tick).

---

## Shared storage

Payloads should prefer `storageKey` over machine-local paths when web and worker do not share disks.

Worker downloads via `ObjectStorage.downloadToFile` into `ASF_MEDIA_WORKER_CACHE_DIR`.

---

## Recovery

1. Inspect `workflow_jobs` / file queue for `failed` / expired `leased`.
2. Fix payload / media availability.
3. Re-enqueue with a **new** idempotency key (or clear failed row carefully).
4. Never delete original recordings during recovery.
5. Temp artifacts under the worker cache dir may be deleted; approved outputs must not.

---

## Health

`MEDIA_WORKER_ENABLED=true` alone is not proof a worker is online. Ops dashboard (M9.10) should observe recent claims / heartbeats.
