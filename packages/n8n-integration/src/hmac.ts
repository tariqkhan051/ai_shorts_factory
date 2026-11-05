import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import type { N8nConfig } from './config.js';

export const N8N_SIGNATURE_HEADER = 'x-asf-signature';
export const N8N_TIMESTAMP_HEADER = 'x-asf-timestamp';
export const N8N_IDEMPOTENCY_HEADER = 'x-asf-idempotency-key';
export const N8N_EVENT_ID_HEADER = 'x-asf-event-id';

export type SignedWebhookHeaders = {
  [N8N_SIGNATURE_HEADER]: string;
  [N8N_TIMESTAMP_HEADER]: string;
  [N8N_IDEMPOTENCY_HEADER]: string;
  [N8N_EVENT_ID_HEADER]: string;
  'content-type': string;
};

/**
 * Canonical signing payload: `${timestamp}.${rawBody}`
 * Signature format: `sha256=<hex>`
 */
export function signWebhookPayload(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
  return `sha256=${digest}`;
}

export function buildSignedHeaders(input: {
  secret: string;
  rawBody: string;
  idempotencyKey: string;
  eventId: string;
  timestamp?: string;
}): SignedWebhookHeaders {
  const timestamp = input.timestamp ?? String(Date.now());
  return {
    [N8N_SIGNATURE_HEADER]: signWebhookPayload(input.secret, timestamp, input.rawBody),
    [N8N_TIMESTAMP_HEADER]: timestamp,
    [N8N_IDEMPOTENCY_HEADER]: input.idempotencyKey,
    [N8N_EVENT_ID_HEADER]: input.eventId,
    'content-type': 'application/json',
  };
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export type SignatureValidationResult =
  | { ok: true; timestampMs: number }
  | { ok: false; reason: string };

export function validateWebhookSignature(input: {
  secret: string;
  rawBody: string;
  signatureHeader: string | null | undefined;
  timestampHeader: string | null | undefined;
  toleranceMs: number;
  nowMs?: number;
}): SignatureValidationResult {
  const signature = input.signatureHeader?.trim();
  const timestampRaw = input.timestampHeader?.trim();
  if (!signature || !timestampRaw) {
    return { ok: false, reason: 'Missing signature or timestamp header' };
  }
  if (!signature.startsWith('sha256=')) {
    return { ok: false, reason: 'Unsupported signature scheme' };
  }

  const timestampMs = Number(timestampRaw);
  if (!Number.isFinite(timestampMs)) {
    return { ok: false, reason: 'Invalid timestamp' };
  }

  const now = input.nowMs ?? Date.now();
  if (Math.abs(now - timestampMs) > input.toleranceMs) {
    return { ok: false, reason: 'Timestamp outside allowed tolerance (replay protection)' };
  }

  const expected = signWebhookPayload(input.secret, timestampRaw, input.rawBody);
  if (!safeEqualHex(expected, signature)) {
    return { ok: false, reason: 'Invalid signature' };
  }

  return { ok: true, timestampMs };
}

export function validateAgainstConfig(
  config: N8nConfig,
  input: {
    rawBody: string;
    signatureHeader: string | null | undefined;
    timestampHeader: string | null | undefined;
    nowMs?: number;
  },
): SignatureValidationResult {
  if (!config.webhookSecret) {
    return { ok: false, reason: 'Webhook secret not configured' };
  }
  return validateWebhookSignature({
    secret: config.webhookSecret,
    rawBody: input.rawBody,
    signatureHeader: input.signatureHeader,
    timestampHeader: input.timestampHeader,
    toleranceMs: config.timestampToleranceMs,
    nowMs: input.nowMs,
  });
}

export function newEventId(): string {
  return randomUUID();
}
