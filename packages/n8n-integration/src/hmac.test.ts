import { describe, expect, it } from 'vitest';
import {
  buildSignedHeaders,
  signWebhookPayload,
  validateWebhookSignature,
} from './hmac.js';

describe('n8n webhook HMAC', () => {
  const secret = 'test-webhook-secret';
  const body = '{"event_id":"11111111-1111-4111-8111-111111111111"}';

  it('signs and validates matching payloads', () => {
    const timestamp = String(1_700_000_000_000);
    const signature = signWebhookPayload(secret, timestamp, body);
    const result = validateWebhookSignature({
      secret,
      rawBody: body,
      signatureHeader: signature,
      timestampHeader: timestamp,
      toleranceMs: 60_000,
      nowMs: 1_700_000_000_000,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects invalid signatures', () => {
    const timestamp = String(1_700_000_000_000);
    const result = validateWebhookSignature({
      secret,
      rawBody: body,
      signatureHeader: 'sha256=deadbeef',
      timestampHeader: timestamp,
      toleranceMs: 60_000,
      nowMs: 1_700_000_000_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Invalid signature/i);
  });

  it('rejects replayed timestamps outside tolerance', () => {
    const timestamp = String(1_700_000_000_000);
    const headers = buildSignedHeaders({
      secret,
      rawBody: body,
      idempotencyKey: 'key-1',
      eventId: '11111111-1111-4111-8111-111111111111',
      timestamp,
    });
    const result = validateWebhookSignature({
      secret,
      rawBody: body,
      signatureHeader: headers['x-asf-signature'],
      timestampHeader: headers['x-asf-timestamp'],
      toleranceMs: 5_000,
      nowMs: 1_700_000_000_000 + 60_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/tolerance|replay/i);
  });

  it('rejects unauthorized missing headers', () => {
    const result = validateWebhookSignature({
      secret,
      rawBody: body,
      signatureHeader: null,
      timestampHeader: null,
      toleranceMs: 60_000,
      nowMs: Date.now(),
    });
    expect(result.ok).toBe(false);
  });
});
