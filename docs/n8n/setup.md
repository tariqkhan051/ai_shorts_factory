# n8n Human-in-the-Loop Orchestration Setup

AI Shorts Factory remains the source of truth for projects, videos, scenes, assets, credits, and assembly. n8n only coordinates notifications and wait/resume around **manual** Google Flow generation.

## Safety

- No Playwright / Puppeteer / CDP against Google Flow
- No CAPTCHA bypass, fingerprinting, or hidden Flow APIs
- `google-flow-manual` stays the default real-Flow provider
- CI never spends live Flow credits
- Disabling n8n does not block Flow Package, upload, verify, or assemble

## Environment

Add to `apps/web/.env.local` (see root `.env.example`):

```bash
N8N_ENABLED=false
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=
N8N_WEBHOOK_SECRET=generate-a-long-random-secret
N8N_WORKFLOW_ID=
N8N_CALLBACK_BASE_URL=http://localhost:3000
```

Never commit real secrets.

## Optional local n8n (Docker)

```bash
# from repo root
docker compose -f docker/n8n/docker-compose.yml up -d
```

Open http://localhost:5678 and import:

1. `docs/n8n/workflows/A-video-orchestrator.json`
2. `docs/n8n/workflows/B-scene-notification.json`
3. `docs/n8n/workflows/C-upload-verification-callback.json`
4. `docs/n8n/workflows/D-recovery-monitoring.json`

Activate workflows. Copy the production webhook URL for Workflow A into app config if it differs from `/webhook/asf-orchestrator`.

Configure Workflow B with your preferred notifier (email/Telegram/Slack/etc.). None is mandatory.

## Webhook registration

App → n8n:

- `POST {N8N_BASE_URL}/webhook/asf-orchestrator`
- Headers: `x-asf-signature`, `x-asf-timestamp`, `x-asf-idempotency-key`, `x-asf-event-id`
- Signature: `sha256=HMAC_SHA256(secret, "${timestamp}.${rawBody}")`

n8n → app (status fetch):

- `GET {APP_URL}/api/n8n/projects/{projectId}/status?userId=...&videoId=...`
- `Authorization: Bearer {N8N_WEBHOOK_SECRET}`

Health (no secrets):

- `GET {APP_URL}/api/n8n/health`

## Operator flow

1. Enable orchestration on **Project → Automation**
2. Approve story (or click **Start**) → `video.approved` event
3. Receive scene notification with Flow Package link
4. Open Flow Package in ASF → copy prompt → generate in **normal Chrome** Flow → download MP4
5. Upload MP4 in ASF → app verifies + stores `REAL_GENERATED`
6. App emits `scene.verification.completed` / `scene.real_generated` → n8n advances
7. Repeat until five verified real assets → existing real assembly gate unlocks

## Health checks

```bash
curl -s http://localhost:3000/api/n8n/health
curl -s http://localhost:5678/healthz
```

## Without n8n

Leave `N8N_ENABLED=false`. Use Flow Package → manual generate → upload → assemble exactly as before.
