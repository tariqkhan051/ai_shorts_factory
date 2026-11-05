import { randomUUID } from 'node:crypto';
import { nextRetryIso } from './backoff.js';
import type { N8nConfig } from './config.js';
import { assertSafePublicConfig, isN8nConfigured } from './config.js';
import type { N8nHttpClient } from './client.js';
import type {
  EventDeliveryRecord,
  EventDeliveryStore,
  IntegrationStatusSnapshot,
} from './delivery-types.js';
import {
  N8N_EVENT_SCHEMA_VERSION,
  n8nEventEnvelopeSchema,
  type CreateN8nEventInput,
  type N8nEventEnvelope,
} from './events.js';
import { newEventId } from './hmac.js';

export type N8nEventPublisherOptions = {
  config: N8nConfig;
  store: EventDeliveryStore;
  client: N8nHttpClient;
  /** Override webhook path (default /webhook/asf-orchestrator). */
  webhookPath?: string;
  now?: () => Date;
};

function blankRecord(event: N8nEventEnvelope, nowIso: string): EventDeliveryRecord {
  return {
    id: event.event_id,
    event,
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    nextRetryAt: null,
    deliveredAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    responseStatus: null,
  };
}

/**
 * Idempotent outbound event publisher for n8n.
 * When disabled/unconfigured, records skipped_disabled and never throws into app flows.
 */
export class N8nEventPublisher {
  constructor(private readonly options: N8nEventPublisherOptions) {}

  buildEnvelope(input: CreateN8nEventInput): N8nEventEnvelope {
    const now = this.options.now?.() ?? new Date();
    return n8nEventEnvelopeSchema.parse({
      event_id: input.eventId ?? newEventId(),
      event_type: input.eventType,
      occurred_at: input.occurredAt ?? now.toISOString(),
      project_id: input.projectId,
      video_id: input.videoId,
      scene_id: input.sceneId ?? null,
      idempotency_key: input.idempotencyKey,
      schema_version: N8N_EVENT_SCHEMA_VERSION,
      correlation_id: input.correlationId,
      status: input.status ?? {},
    });
  }

  /**
   * Publish (or reuse) an event by idempotency key.
   * Safe to call from request handlers — failures are audited, not thrown.
   */
  async publish(input: CreateN8nEventInput): Promise<EventDeliveryRecord> {
    const existing = await this.options.store.getByIdempotencyKey(input.idempotencyKey);
    if (existing?.status === 'delivered') {
      return existing;
    }
    if (existing?.status === 'skipped_disabled' && !isN8nConfigured(this.options.config)) {
      return existing;
    }

    const envelope = existing?.event ?? this.buildEnvelope(input);
    const nowIso = (this.options.now?.() ?? new Date()).toISOString();
    let record = existing ?? blankRecord(envelope, nowIso);

    if (!isN8nConfigured(this.options.config)) {
      record = {
        ...record,
        status: 'skipped_disabled',
        updatedAt: nowIso,
        lastError: this.options.config.enabled
          ? 'n8n enabled but incomplete configuration'
          : 'n8n disabled',
      };
      return this.options.store.upsert(record);
    }

    return this.attemptDelivery(record);
  }

  async retry(eventId: string): Promise<EventDeliveryRecord | null> {
    const existing = await this.options.store.getByEventId(eventId);
    if (!existing) return null;
    if (existing.status === 'delivered') return existing;
    if (!isN8nConfigured(this.options.config)) {
      const nowIso = (this.options.now?.() ?? new Date()).toISOString();
      return this.options.store.upsert({
        ...existing,
        status: 'skipped_disabled',
        updatedAt: nowIso,
        lastError: 'Cannot retry while n8n is disabled/unconfigured',
      });
    }
    return this.attemptDelivery(existing);
  }

  async retryFailed(limit = 20): Promise<EventDeliveryRecord[]> {
    const nowIso = (this.options.now?.() ?? new Date()).toISOString();
    const retryable = await this.options.store.listRetryable(nowIso, limit);
    const results: EventDeliveryRecord[] = [];
    for (const item of retryable) {
      results.push(await this.attemptDelivery(item));
    }
    return results;
  }

  async getStatus(): Promise<IntegrationStatusSnapshot> {
    const publicConfig = assertSafePublicConfig(this.options.config);
    const health = await this.options.client.checkHealth();
    const recent = await this.options.store.listRecent(100);
    const failures = recent.filter(
      (item) => item.status === 'failed' || item.status === 'dead_letter',
    );
    const lastSuccess = recent.find((item) => item.status === 'delivered');

    return {
      enabled: publicConfig.enabled,
      configured: publicConfig.configured,
      healthy: publicConfig.configured ? health.reachable : !publicConfig.enabled,
      healthMessage: health.message,
      baseUrlHost: publicConfig.baseUrlHost,
      workflowId: publicConfig.workflowId,
      lastSuccessfulEvent: lastSuccess
        ? {
            eventId: lastSuccess.event.event_id,
            eventType: lastSuccess.event.event_type,
            deliveredAt: lastSuccess.deliveredAt ?? lastSuccess.updatedAt,
            projectId: lastSuccess.event.project_id,
            videoId: lastSuccess.event.video_id,
          }
        : null,
      pendingDeliveries: recent.filter((item) => item.status === 'pending').length,
      failedDeliveries: recent.filter((item) => item.status === 'failed').length,
      deadLetterDeliveries: recent.filter((item) => item.status === 'dead_letter').length,
      recentFailures: failures.slice(0, 20).map((item) => ({
        eventId: item.event.event_id,
        eventType: item.event.event_type,
        lastError: item.lastError,
        attempts: item.attempts,
        updatedAt: item.updatedAt,
      })),
    };
  }

  private async attemptDelivery(record: EventDeliveryRecord): Promise<EventDeliveryRecord> {
    const now = this.options.now?.() ?? new Date();
    const nowIso = now.toISOString();
    const attempt = record.attempts + 1;
    const result = await this.options.client.deliverEvent(
      record.event,
      this.options.webhookPath,
    );

    if (result.ok) {
      return this.options.store.upsert({
        ...record,
        status: 'delivered',
        attempts: attempt,
        lastAttemptAt: nowIso,
        lastError: null,
        nextRetryAt: null,
        deliveredAt: nowIso,
        updatedAt: nowIso,
        responseStatus: result.statusCode,
      });
    }

    const maxAttempts = this.options.config.maxDeliveryAttempts;
    const dead = attempt >= maxAttempts;
    return this.options.store.upsert({
      ...record,
      status: dead ? 'dead_letter' : 'failed',
      attempts: attempt,
      lastAttemptAt: nowIso,
      lastError: result.error,
      nextRetryAt: dead
        ? null
        : nextRetryIso(
            attempt,
            this.options.config.retryBaseDelayMs,
            this.options.config.retryMaxDelayMs,
            now.getTime(),
          ),
      updatedAt: nowIso,
      responseStatus: result.statusCode,
    });
  }
}

/** Stable correlation id helper for a video orchestration run. */
export function createOrchestrationCorrelationId(projectId: string, videoId: string): string {
  return `orch:${projectId}:${videoId}:${randomUUID()}`;
}
