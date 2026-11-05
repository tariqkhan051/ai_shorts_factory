import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  N8N_SIGNATURE_HEADER,
  N8N_TIMESTAMP_HEADER,
  buildSignedHeaders,
} from '@ai-shorts-factory/n8n-integration';
import { authenticateN8nBearer, authenticateN8nRequest } from './auth';
import { resetN8nRuntimeForTests } from './runtime';

describe('n8n request auth', () => {
  const secret = 'unit-test-webhook-secret';

  beforeEach(() => {
    resetN8nRuntimeForTests();
    process.env.N8N_ENABLED = 'true';
    process.env.N8N_BASE_URL = 'http://localhost:5678';
    process.env.N8N_WEBHOOK_SECRET = secret;
  });

  afterEach(() => {
    resetN8nRuntimeForTests();
    delete process.env.N8N_ENABLED;
    delete process.env.N8N_BASE_URL;
    delete process.env.N8N_WEBHOOK_SECRET;
  });

  it('accepts valid HMAC bodies', async () => {
    const rawBody = JSON.stringify({ event_id: '11111111-1111-4111-8111-111111111111' });
    const headers = buildSignedHeaders({
      secret,
      rawBody,
      idempotencyKey: 'k1',
      eventId: '11111111-1111-4111-8111-111111111111',
      timestamp: String(Date.now()),
    });
    const request = new Request('http://localhost/api/n8n/test', {
      method: 'POST',
      headers,
      body: rawBody,
    });
    const result = await authenticateN8nRequest(request);
    expect(result.ok).toBe(true);
  });

  it('rejects unauthorized bearer', () => {
    const request = new Request('http://localhost/api/n8n/projects/p/status', {
      headers: { Authorization: 'Bearer wrong' },
    });
    const result = authenticateN8nBearer(request);
    expect(result.ok).toBe(false);
  });

  it('rejects replayed signatures', async () => {
    const rawBody = '{}';
    const headers = buildSignedHeaders({
      secret,
      rawBody,
      idempotencyKey: 'k2',
      eventId: '22222222-2222-4222-8222-222222222222',
      timestamp: String(Date.now() - 60 * 60 * 1000),
    });
    const request = new Request('http://localhost/api/n8n/test', {
      method: 'POST',
      headers: {
        [N8N_SIGNATURE_HEADER]: headers[N8N_SIGNATURE_HEADER],
        [N8N_TIMESTAMP_HEADER]: headers[N8N_TIMESTAMP_HEADER],
      },
      body: rawBody,
    });
    const result = await authenticateN8nRequest(request);
    expect(result.ok).toBe(false);
  });
});
