# Monitoring

## HTTP probes

| Endpoint          | Purpose                                   | Healthy |
| ----------------- | ----------------------------------------- | ------- |
| `GET /api/health` | Process liveness                          | 200     |
| `GET /api/ready`  | Config readiness (stricter in production) | 200     |

Wire these into your host (Vercel/Fly/Railway/uptime monitor). Alert on ready ≠ 200 for 2+ minutes.

## Structured logs

Workers emit JSON lines via `createLogger(service)`:

- `jobId`, `jobType`, `projectId`, `durationMs`, `state`, `lastError`
- Respect `LOG_LEVEL` (`debug` \| `info` \| `warn` \| `error`)

Ship stdout to your log drain. Suggested alerts:

- Spike in `state=failed` over 15 minutes
- `Live Flow gates failed` errors
- `/api/ready` issues containing `PROJECT_STORE=memory`

## Dashboard

In-app SSE notifications cover generation/assembly outcomes for the signed-in operator. They are not a substitute for host-level probes.
