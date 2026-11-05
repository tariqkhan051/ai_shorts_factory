/**
 * Package: @ai-shorts-factory/n8n-integration
 * Optional external orchestrator bridge for human-in-the-loop Flow production.
 *
 * Safety:
 * - Never drives Google Flow / Playwright.
 * - Never a hard dependency for story, upload, or assembly.
 * - Application remains authoritative for projects, videos, scenes, credits, assets.
 */

export const PACKAGE_NAME = '@ai-shorts-factory/n8n-integration' as const;
export const PACKAGE_PHASE = 8 as const;
export const PACKAGE_STATUS = 'active' as const;

export {
  readN8nConfig,
  isN8nConfigured,
  assertSafePublicConfig,
  type N8nConfig,
} from './config.js';

export {
  N8N_EVENT_SCHEMA_VERSION,
  N8N_EVENT_TYPES,
  n8nEventEnvelopeSchema,
  buildIdempotencyKey,
  type N8nEventType,
  type N8nEventEnvelope,
  type CreateN8nEventInput,
} from './events.js';

export {
  N8N_SIGNATURE_HEADER,
  N8N_TIMESTAMP_HEADER,
  N8N_IDEMPOTENCY_HEADER,
  N8N_EVENT_ID_HEADER,
  signWebhookPayload,
  buildSignedHeaders,
  validateWebhookSignature,
  validateAgainstConfig,
  newEventId,
  type SignedWebhookHeaders,
  type SignatureValidationResult,
} from './hmac.js';

export {
  DELIVERY_STATUSES,
  type DeliveryStatus,
  type EventDeliveryRecord,
  type OrchestrationStatus,
  type OrchestrationRecord,
  type IntegrationStatusSnapshot,
  type EventDeliveryStore,
  type OrchestrationStore,
} from './delivery-types.js';

export {
  MemoryEventDeliveryStore,
  MemoryOrchestrationStore,
} from './memory-delivery-store.js';

export { FileEventDeliveryStore, FileOrchestrationStore } from './file-delivery-store.js';

export {
  N8nClient,
  DisabledN8nClient,
  type N8nHttpClient,
  type N8nHealthResult,
  type N8nDeliveryResult,
} from './client.js';

export { computeBackoffDelayMs, nextRetryIso } from './backoff.js';

export {
  N8nEventPublisher,
  createOrchestrationCorrelationId,
  type N8nEventPublisherOptions,
} from './publisher.js';

export {
  OrchestrationController,
  createDefaultOrchestration,
  type OrchestrationControlAction,
} from './orchestration.js';

export function getPackageMeta() {
  return {
    name: PACKAGE_NAME,
    phase: PACKAGE_PHASE,
    status: PACKAGE_STATUS,
    description:
      'Optional n8n orchestration bridge with signed events, delivery audit, and HITL wait/resume — no Flow browser automation',
    flowAutomation: false,
  } as const;
}
