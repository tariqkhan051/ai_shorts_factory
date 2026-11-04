# Google Flow setup (live canary)

Live generation uses **Playwright against the Google Flow website**, behind `VideoGenerationProvider`. There is no invented Flow HTTP API. CI must keep `FLOW_PROVIDER=mock`.

## Safety rules

- Never store Google passwords in application configuration.
- Keep the browser profile directory local and protected (`.flow-profile/` is gitignored).
- Never log cookies, tokens, or profile contents.
- Never bypass CAPTCHA / identity challenges — pause for a human.
- Never auto-spend credits from the web UI.
- Canary mode generates **Scene 1 only** until you unlock five-scene live.

## 1. Install Chromium for Playwright

```bash
pnpm exec playwright install chromium
```

## 2. Create a persistent browser profile

```bash
# Example — adjust path for your machine
mkdir .flow-profile
```

Set:

```bash
FLOW_BROWSER_PROFILE_DIR=./.flow-profile
FLOW_HEADLESS=false
```

### Manual authentication only (recommended first)

1. Confirm the real Google Flow workspace URL yourself (do not guess).
2. Set `FLOW_BASE_URL` to that URL (keep `FLOW_EXECUTE_LIVE=false`).
3. Run:

```bash
pnpm --filter @ai-shorts-factory/flow-worker auth:session
```

4. Sign in manually in the headed window. Complete CAPTCHA yourself if shown.
5. When the Flow workspace is visible, type `WORKSPACE_VISIBLE` in the terminal.
6. The browser closes; the profile stays on disk under `.flow-profile/` (gitignored).
7. This helper never clicks Generate and never spends credits.

### “This browser or app may not be secure”

Google often blocks sign-in inside Playwright’s **bundled Chromium**. Use an installed browser channel instead:

```bash
FLOW_BROWSER_CHANNEL=chrome   # or msedge
FLOW_HEADLESS=false
```

Or open Chrome yourself with the same profile (then close Chrome before the worker uses it):

```bash
# Windows example
chrome.exe --user-data-dir="D:\repos\personal\ai_shorts_factory\.flow-profile" https://flow.google.com/
```

Do **not** use stealth plugins or CAPTCHA bypass tools.

If CAPTCHA or extra verification appears, finish it yourself. Automation stops and reports `HUMAN_INTERVENTION_REQUIRED`.

## 3. Verify the UI recipe

1. Open Google Flow in a normal browser with your account.
2. Confirm automation is allowed under your workspace policy.
3. Inspect the live UI and fill selectors in `packages/flow-adapter/recipes/google-flow.unverified.json` (or a private copy):
   - `promptInput`, `modelControl`, `durationControl`, `resolutionControl`
   - `aspectRatioControl` (intended `9:16`)
   - `submitButton`, `resultReady`, `downloadButton`
   - optional: `creditCostBadge`, `loginRequired`, `captchaOrChallenge`, `workspaceReady`
4. Set `baseUrl`, `modelOptionLabel`, `aspectRatioOptionLabel`.
5. Set `verifiedAt` / `verifiedBy`, then:

```bash
FLOW_UI_VERIFIED=true
FLOW_UI_RECIPE_PATH=path/to/your-verified-recipe.json
FLOW_BASE_URL=https://your-flow-url
```

If a requested model/duration/resolution/aspect ratio is not visible in the account UI, automation **stops** — it will not silently substitute another option.

### Observed live UI labels (2026-11-04 inspect, no Generate)

Project used: **ASF Canary Inspect** (`https://flow.google.com/project/cd052117-55ba-426e-a396-9eb70d48dbfa`).

| Intent | Observed in UI |
| --- | --- |
| Prompt | `[role=textbox][aria-label="What do you want to create?"]` |
| Submit | `button[aria-label="Start generation"]` |
| Video model control | `[aria-label="Video generation default model"]` |
| Canary model label | **Veo 3.1 - Lite** (default; also Omni 1.1 Flash / Veo 3.1 Fast / Quality). Switch via `DEFAULT_GENERATION_MODEL` or `FLOW_MODEL_OPTION_LABEL`. |
| Video aspect | `[aria-label="Video generation default aspect ratio"]` — **16:9** and **9:16** |
| Safety | Agent settings **Confirm before generating = Always** |
| Duration 6s | **Not found** as a discrete control |
| Resolution 720p | **Not found** as a discrete control |
| resultReady / download | **Not mappable** until a real generation exists |

Recipe remains `verifiedAt: null` until duration/resolution strategy + result/download selectors are decided. Summary: `diagnostic-screenshots/canary/ui-inspect-summary.json`.

## 4. Live env (canary)

```bash
FLOW_PROVIDER=google-flow
FLOW_LIVE_ENABLED=true
FLOW_UI_VERIFIED=true
FLOW_CANARY_ONLY=true
FLOW_MAX_LIVE_SCENES_PER_PROJECT=1
FLOW_MAX_SIMULTANEOUS_GENERATIONS=1
FLOW_EXECUTE_LIVE=false
# Model is configurable — must match a visible Flow UI label:
DEFAULT_GENERATION_MODEL=Veo 3.1 - Lite
# Optional when the UI label differs from DEFAULT_GENERATION_MODEL:
# FLOW_MODEL_OPTION_LABEL=Veo 3.1 - Lite
```

## 5. Canary testing procedure (Scene 1 only)

1. Create/approve a five-scene screenplay in the app (Story Studio).
2. Open **Scene generation** → **Flow Integration** + **Live canary**.
3. Click **Prepare canary preflight** — reviews prompt, model, aspect, budget. **No credits spent.**
4. Type `SPEND_REAL_CREDITS` and authorize. Still **does not** submit to Flow.
5. Review the printed worker command. Only when you are ready:

```bash
FLOW_PROVIDER=google-flow \
FLOW_LIVE_ENABLED=true \
FLOW_CANARY_ONLY=true \
FLOW_MAX_LIVE_SCENES_PER_PROJECT=1 \
FLOW_UI_VERIFIED=true \
FLOW_BROWSER_PROFILE_DIR=./.flow-profile \
FLOW_UI_RECIPE_PATH=./path/to/verified-recipe.json \
FLOW_HEADLESS=false \
FLOW_SPEND_CONFIRMATION_TOKEN=<token-from-preflight> \
FLOW_SPEND_CONFIRM_PHRASE=SPEND_REAL_CREDITS \
FLOW_CANARY_PROMPT="<exact scene 1 prompt>" \
FLOW_EXECUTE_LIVE=true \
pnpm --filter @ai-shorts-factory/flow-worker canary:scene
```

6. Worker submits **one** generation, monitors completion, downloads, FFprobe-verifies when available, stores `REAL_GENERATED`, reconciles credits (unknown if Flow does not expose cost).
7. Scene 2+ stay locked while `FLOW_CANARY_ONLY=true`.

### Preflight-only (default)

Omit `FLOW_EXECUTE_LIVE` (or set `false`) to print the report and exit without spending.

## 6. After canary passes

Manually review the downloaded Scene 1 clip and credit ledger. Then unlock:

```bash
FLOW_CANARY_ONLY=false
FLOW_MAX_LIVE_SCENES_PER_PROJECT=5
```

Continue sequentially: verify each scene before the next. Completed scenes are never regenerated automatically.

## 7. Credit accounting

Immutable ledger tracks:

- available / reserved / confirmed spent
- estimated vs unknown consumption
- released reservations
- manual adjustments

Expected cost ≠ actual cost. If Flow UI does not show a cost badge, consumption is marked **UNKNOWN** for manual reconciliation against the Google account balance. Failed/interrupted generations are **never** auto-refunded without evidence credits were unused.

## 8. Duplicate-generation protection

- Idempotency key per project/scene/attempt
- `SUBMITTING` persisted before Generate click
- Process crash during submit → `UNKNOWN_SUBMISSION` (no blind retry)
- Timeouts ≠ failure
- Max simultaneous live generations = 1 (process-local + `FLOW_LIVE_LOCK_PATH` file lock)
- Live runs hard-cap at **one scene** unless `allowFullLiveProject` after `FLOW_CANARY_ONLY=false`
- Manual retry of `UNKNOWN_SUBMISSION` requires `FLOW_UNKNOWN_RECONCILED=true` **and** spend confirmation
- CI / `NODE_ENV=test` refuse to construct the live provider

## 9. Troubleshooting

| Symptom | Action |
| ------- | ------ |
| `AUTHENTICATION_REQUIRED` | Sign in manually in the persistent profile (`FLOW_HEADLESS=false`) |
| CAPTCHA / verification | Complete challenge yourself; do not bypass |
| Recipe unverified | Fill selectors + `verifiedAt`; set `FLOW_UI_VERIFIED=true` |
| Model unavailable | Stop; update recipe/model to an option visible in your account |
| `UNKNOWN_SUBMISSION` | Check Flow UI history + account credits; reconcile ledger; confirm before retry |
| `DOWNLOAD_FAILED` / `VERIFICATION_FAILED` | Keep reservation unknown; inspect diagnostics; do not mark COMPLETED |
| CI wanting live Flow | Forbidden — keep `FLOW_PROVIDER=mock` |

## 10. Production deployment requirements

- Default `FLOW_PROVIDER=mock` unless an operator intentionally enables live gates on a dedicated worker host
- Browser profile on encrypted disk, excluded from backups that leave your control
- No Google passwords in secrets managers
- Canary must pass before `FLOW_CANARY_ONLY=false`
- Workers and web must not share an unsafe assumption that timeout means “free retry”
