# Optional Chrome Extension Assessment (Phase 8)

## Verdict

**Do not implement a Flow-interacting Chrome extension in this phase.**

A minimal companion extension could add convenience later, but it is not required for n8n HITL orchestration and carries risk of being misunderstood as Flow automation.

## Potential value (later)

If built, a companion extension may only:

- Open AI Shorts Factory pages (Flow Package, Automation)
- Show ASF notifications / current scene task status
- Deep-link to a scene package
- Help copy prompts **while the user is on AI Shorts Factory**
- Surface local orchestration status

## Hard prohibitions

Must never:

- Inject scripts into Google Flow
- Modify Flow DOM
- Observe Flow form fields
- Click Flow controls (including Generate)
- Read Flow page data
- Download Flow files automatically
- Bypass browser security or unusual-activity detection

Normal Chrome must remain unmodified for Flow generation.

## Recommendation

Prefer ASF web UI + n8n notifications + Flow Package deep links. Revisit a companion extension only if operators report friction that cannot be solved in-app.
