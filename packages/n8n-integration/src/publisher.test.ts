import { describe, expect, it, vi } from 'vitest';
import { readN8nConfig } from './config.js';
import type { N8nDeliveryResult, N8nHealthResult, N8nHttpClient } from './client.js';
import { MemoryEventDeliveryStore } from './memory-delivery-store.js';
import { N8nEventPublisher } from './publisher.js';
import type { N8nEventEnvelope } from './events.js';

class ScriptedClient implements N8nHttpClient {
  deliveries: N8nEventEnvelope[] = [];
  failUntilAttempt = 0;
  attempt = 0;

  async checkHealth(): Promise<N8nHealthResult> {
    return {
      ok: true,
      reachable: true,
      message: 'ok',
      checkedAt: new Date().toISOString(),
      statusCode: 200,
    };
  }

  async deliverEvent(event: N8nEventEnvelope): Promise<N8nDeliveryResult> {
    this.attempt += 1;
    this.deliveries.push(event);
    if (this.attempt <= this.failUntilAttempt) {
      return { ok: false, statusCode: 500, bodyText: 'err', error: 'boom' };
    }
    return { ok: true, statusCode: 200, bodyText: 'ok', error: null };
  }
}

describe('N8nEventPublisher', () => {
  it('skips delivery when disabled without throwing', async () => {
    const store = new MemoryEventDeliveryStore();
    const client = new ScriptedClient();
    const publisher = new N8nEventPublisher({
      config: readN8nConfig({ N8N_ENABLED: 'false' }),
      store,
      client,
    });

    const record = await publisher.publish({
      eventType: 'video.approved',
      projectId: 'p1',
      videoId: 'v1',
      idempotencyKey: 'video.approved:p1:v1',
    });

    expect(record.status).toBe('skipped_disabled');
    expect(client.deliveries).toHaveLength(0);
  });

  it('delivers once and treats duplicate idempotency as no-op', async () => {
    const store = new MemoryEventDeliveryStore();
    const client = new ScriptedClient();
    const publisher = new N8nEventPublisher({
      config: readN8nConfig({
        N8N_ENABLED: 'true',
        N8N_BASE_URL: 'http://localhost:5678',
        N8N_WEBHOOK_SECRET: 'secret',
      }),
      store,
      client,
    });

    const first = await publisher.publish({
      eventType: 'scene.verification.completed',
      projectId: 'p1',
      videoId: 'v1',
      sceneId: 's1',
      idempotencyKey: 'scene.verification.completed:p1:s1:abc',
      status: { asset_origin: 'REAL_GENERATED' },
    });
    const second = await publisher.publish({
      eventType: 'scene.verification.completed',
      projectId: 'p1',
      videoId: 'v1',
      sceneId: 's1',
      idempotencyKey: 'scene.verification.completed:p1:s1:abc',
    });

    expect(first.status).toBe('delivered');
    expect(second.event.event_id).toBe(first.event.event_id);
    expect(client.deliveries).toHaveLength(1);
  });

  it('dead-letters after bounded retries', async () => {
    const store = new MemoryEventDeliveryStore();
    const client = new ScriptedClient();
    client.failUntilAttempt = 99;
    const publisher = new N8nEventPublisher({
      config: readN8nConfig({
        N8N_ENABLED: 'true',
        N8N_BASE_URL: 'http://localhost:5678',
        N8N_WEBHOOK_SECRET: 'secret',
        N8N_MAX_DELIVERY_ATTEMPTS: '2',
        N8N_RETRY_BASE_DELAY_MS: '1',
        N8N_RETRY_MAX_DELAY_MS: '1',
      }),
      store,
      client,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    });

    const first = await publisher.publish({
      eventType: 'video.assembly.failed',
      projectId: 'p1',
      videoId: 'v1',
      idempotencyKey: 'video.assembly.failed:p1:v1:1',
    });
    expect(first.status).toBe('failed');

    vi.spyOn(Math, 'random').mockReturnValue(0);
    const retried = await publisher.retry(first.event.event_id);
    expect(retried?.status).toBe('dead_letter');
    expect(retried?.attempts).toBe(2);
  });

  it('never exposes webhook secrets in status snapshot', async () => {
    const store = new MemoryEventDeliveryStore();
    const client = new ScriptedClient();
    const publisher = new N8nEventPublisher({
      config: readN8nConfig({
        N8N_ENABLED: 'true',
        N8N_BASE_URL: 'http://n8n.local:5678',
        N8N_WEBHOOK_SECRET: 'super-secret',
        N8N_API_KEY: 'api-key-secret',
        N8N_WORKFLOW_ID: 'wf-1',
      }),
      store,
      client,
    });

    const status = await publisher.getStatus();
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain('super-secret');
    expect(serialized).not.toContain('api-key-secret');
    expect(status.baseUrlHost).toBe('n8n.local:5678');
    expect(status.workflowId).toBe('wf-1');
  });
});
