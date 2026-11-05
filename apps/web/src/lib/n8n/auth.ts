import {
  N8N_SIGNATURE_HEADER,
  N8N_TIMESTAMP_HEADER,
  validateAgainstConfig,
} from '@ai-shorts-factory/n8n-integration';
import { getN8nConfig } from './runtime.js';

export type N8nRequestAuthResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

/**
 * Authenticate inbound n8n → app requests via HMAC headers.
 * Never accepts unsigned callbacks as authoritative state changes.
 */
export async function authenticateN8nRequest(request: Request): Promise<N8nRequestAuthResult> {
  const config = getN8nConfig();
  if (!config.webhookSecret) {
    return { ok: false, status: 503, message: 'n8n webhook secret not configured' };
  }

  const rawBody = await request.clone().text();
  const result = validateAgainstConfig(config, {
    rawBody,
    signatureHeader: request.headers.get(N8N_SIGNATURE_HEADER),
    timestampHeader: request.headers.get(N8N_TIMESTAMP_HEADER),
  });

  if (!result.ok) {
    return { ok: false, status: 401, message: result.reason };
  }
  return { ok: true };
}

/** GET requests: sign empty body with timestamp header only is awkward — use shared secret bearer. */
export function authenticateN8nBearer(request: Request): N8nRequestAuthResult {
  const config = getN8nConfig();
  if (!config.webhookSecret) {
    return { ok: false, status: 503, message: 'n8n webhook secret not configured' };
  }
  const header = request.headers.get('authorization');
  const expected = `Bearer ${config.webhookSecret}`;
  if (!header || header !== expected) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
  return { ok: true };
}
