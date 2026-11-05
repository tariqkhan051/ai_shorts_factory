# Optional Official API Provider Investigation (Phase 9)

Separate from n8n. **Do not activate a paid API from this document.**

## Non-assumptions

- Google Flow subscription credits are **not** assumed usable via Gemini / Veo API
- Flow UI model labels are **not** assumed equal to API model IDs
- Flow pricing is **not** assumed equal to API pricing
- API access is **not** assumed included in an existing Flow subscription

## Investigation summary (as of proposal draft)

| Topic | Notes |
| --- | --- |
| Official APIs | Google AI Gemini / Vertex AI expose video generation capabilities under product-specific terms; availability changes by region and account. |
| Models | Confirm current Veo / Gemini video model IDs in official docs at implementation time — do not copy Flow UI labels. |
| Reference images | API reference-image / image-to-video support must be verified per model; not identical to Flow Ingredients UX. |
| Duration / resolution | API constraints differ from Flow composer pills (e.g. 8s / 720p). Gate in app config. |
| Pricing | Billable per API usage; separate from Flow credits. Requires explicit spending gate. |
| Auth | API keys / GCP service accounts — server-only, never browser. |
| Regional availability | Must be checked per project region before enabling. |
| Credit/billing differences | Flow subscription ≠ API prepaid credits. Ledger must treat API spend as a distinct origin. |

## Required application changes (if ever enabled)

1. New provider id (e.g. `google-veo-api`) behind `FLOW_PROVIDER` — **opt-in only**
2. Separate env flags: `FLOW_API_ENABLED`, `FLOW_API_SPEND_CONFIRMATION`, model allow-list
3. Distinct `assetOrigin` / ledger metadata so API bytes never mix silently with Flow manual imports without operator awareness
4. CI remains on `mock` — never live API in tests
5. n8n must not call the paid API directly; app remains spend authority

## Spending gate

Any API provider requires:

- Explicit configuration
- Explicit spend confirmation phrase/token
- Daily budget independent from Flow manual credit ledger (or clearly labeled dual ledger)

## Status

Proposal only. No provider activated. n8n HITL + `google-flow-manual` remains the production path for real clips.
