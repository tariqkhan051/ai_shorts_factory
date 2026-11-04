# RLS audit (Phase 7)

## Summary

| Table                | User JWT                                | Service role                        | Notes                               |
| -------------------- | --------------------------------------- | ----------------------------------- | ----------------------------------- |
| `projects` (+ kids)  | Owner CRUD via `auth.uid()`             | Full                                | Soft-delete via `deleted_at`        |
| `credit_ledger`      | **SELECT only**                         | Append writes                       | Immutable ledger                    |
| `workflow_jobs`      | **SELECT + INSERT** (after `00003`)     | Claim / heartbeat / complete / fail | No user UPDATE on leases            |
| `generation_jobs`    | **SELECT + INSERT** (after `00003`)     | Status transitions                  | Same pattern as workflow jobs       |
| `audit_logs`         | SELECT + **INSERT own** (`00003`)       | Full                                | Fixes silent insert failures        |
| `notifications`      | SELECT / INSERT / UPDATE own; no DELETE | Retention jobs                      | `kind`→`type` reconciled in `00003` |
| `push_subscriptions` | Owner CRUD                              | —                                   | From `00002`                        |
| `system_settings`    | SELECT for authenticated                | Writes                              | No public writes                    |

## Findings addressed in `00003_phase7_hardening.sql`

1. `audit_logs` had SELECT-only RLS while repositories insert with the user client
2. `workflow_jobs` / `generation_jobs` `FOR ALL` allowed clients to mutate lease fields
3. Notification column drift (`kind` vs `type`) between `00001` and `00002`

## Residual risks

- Generation/credits/notifications still primarily memory-backed in the app runtime
- Workers must use `SUPABASE_SERVICE_ROLE_KEY` once a Postgres queue exists — never ship the service role to the browser
- `system_settings` is readable by any authenticated user (non-secret business defaults only)
