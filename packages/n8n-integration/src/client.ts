import type { N8nConfig } from './config.js';
import { isN8nConfigured } from './config.js';
import { buildSignedHeaders } from './hmac.js';
import type { N8nEventEnvelope } from './events.js';

export type N8nHealthResult = {
  ok: boolean;
  reachable: boolean;
  message: string;
  checkedAt: string;
  statusCode: number | null;
};

export type N8nDeliveryResult = {
  ok: boolean;
  statusCode: number | null;
  bodyText: string | null;
  error: string | null;
};

export type N8nHttpClient = {
  checkHealth(): Promise<N8nHealthResult>;
  deliverEvent(event: N8nEventEnvelope, webhookPath?: string): Promise<N8nDeliveryResult>;
};

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

/**
 * Lightweight n8n HTTP client. Never throws for connectivity failures —
 * callers record dead-letter / retry state instead.
 */
export class N8nClient implements N8nHttpClient {
  constructor(
    private readonly config: N8nConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async checkHealth(): Promise<N8nHealthResult> {
    const checkedAt = new Date().toISOString();
    if (!this.config.enabled) {
      return {
        ok: true,
        reachable: false,
        message: 'n8n integration disabled (N8N_ENABLED=false)',
        checkedAt,
        statusCode: null,
      };
    }
    if (!this.config.baseUrl) {
      return {
        ok: false,
        reachable: false,
        message: 'N8N_BASE_URL is not set',
        checkedAt,
        statusCode: null,
      };
    }

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (this.config.apiKey) {
        headers['X-N8N-API-KEY'] = this.config.apiKey;
      }
      const response = await this.fetchImpl(joinUrl(this.config.baseUrl, '/healthz'), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });
      const reachable = response.ok || response.status === 404;
      return {
        ok: reachable,
        reachable,
        message: reachable
          ? `n8n reachable (HTTP ${response.status})`
          : `n8n health check failed (HTTP ${response.status})`,
        checkedAt,
        statusCode: response.status,
      };
    } catch (error) {
      return {
        ok: false,
        reachable: false,
        message: error instanceof Error ? error.message : 'n8n unreachable',
        checkedAt,
        statusCode: null,
      };
    }
  }

  async deliverEvent(
    event: N8nEventEnvelope,
    webhookPath = '/webhook/asf-orchestrator',
  ): Promise<N8nDeliveryResult> {
    if (!isN8nConfigured(this.config) || !this.config.baseUrl || !this.config.webhookSecret) {
      return {
        ok: false,
        statusCode: null,
        bodyText: null,
        error: 'n8n is not configured for delivery',
      };
    }

    const rawBody = JSON.stringify(event);
    const headers = buildSignedHeaders({
      secret: this.config.webhookSecret,
      rawBody,
      idempotencyKey: event.idempotency_key,
      eventId: event.event_id,
    });

    try {
      const response = await this.fetchImpl(joinUrl(this.config.baseUrl, webhookPath), {
        method: 'POST',
        headers,
        body: rawBody,
        signal: AbortSignal.timeout(15_000),
      });
      const bodyText = await response.text().catch(() => null);
      if (!response.ok) {
        return {
          ok: false,
          statusCode: response.status,
          bodyText,
          error: `Webhook delivery failed with HTTP ${response.status}`,
        };
      }
      return { ok: true, statusCode: response.status, bodyText, error: null };
    } catch (error) {
      return {
        ok: false,
        statusCode: null,
        bodyText: null,
        error: error instanceof Error ? error.message : 'Webhook delivery failed',
      };
    }
  }
}

/** No-op client used when n8n is disabled or unavailable in tests. */
export class DisabledN8nClient implements N8nHttpClient {
  async checkHealth(): Promise<N8nHealthResult> {
    return {
      ok: true,
      reachable: false,
      message: 'n8n client disabled',
      checkedAt: new Date().toISOString(),
      statusCode: null,
    };
  }

  async deliverEvent(): Promise<N8nDeliveryResult> {
    return {
      ok: false,
      statusCode: null,
      bodyText: null,
      error: 'n8n client disabled',
    };
  }
}
