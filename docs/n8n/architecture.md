# n8n Integration Architecture

```text
Operator (normal Chrome)
    │  manual Flow generate + download
    ▼
AI Shorts Factory (source of truth)
    │  projects / videos / scenes / assets / credits / assembly
    │
    ├── signed outbound events (HMAC) ──► n8n workflows
    │                                       │
    │                                       ├─ notify operator
    │                                       ├─ Wait (durable)
    │                                       └─ resume on verified callback
    │
    └── status API (Bearer secret) ◄────── n8n re-fetches authority
```

## Smallest safe integration point

Emit hooks at existing mutation boundaries:

| App action | Event(s) |
| --- | --- |
| Story approve / orchestration start | `video.approved` |
| Prepare Flow Package | `scene.package.ready` |
| Mark awaiting manual generation | `scene.awaiting_manual_generation` |
| Verified MP4 import | `scene.uploaded`, `scene.verification.completed`, `scene.real_generated` |
| All five real scenes ready | `video.assembly.ready` |
| Assemble success / failure | `video.assembly.completed` / `video.assembly.failed` |
| Verification failure | `scene.verification.failed` |

## Authority split

| Owned by ASF | Owned by n8n |
| --- | --- |
| Projects, videos, scenes | Execution IDs |
| Character / reference records | Temporary wait state |
| Generation + verification status | Notification history |
| Uploaded files + provenance | |
| Credits + assembly | |

## Package

`packages/n8n-integration` — config, HMAC, publisher, delivery audit, orchestration UI state. Soft dependency: when `N8N_ENABLED=false`, events are recorded as `skipped_disabled` and manual workflow is unchanged.
