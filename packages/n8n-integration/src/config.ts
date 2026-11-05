export type N8nConfig = {
  enabled: boolean;
  baseUrl: string | null;
  apiKey: string | null;
  webhookSecret: string | null;
  workflowId: string | null;
  callbackBaseUrl: string | null;
  /** Max absolute skew for webhook timestamp validation (ms). */
  timestampToleranceMs: number;
  /** Outbound delivery attempts before dead-letter. */
  maxDeliveryAttempts: number;
  /** Base delay for exponential backoff (ms). */
  retryBaseDelayMs: number;
  /** Cap for backoff delay (ms). */
  retryMaxDelayMs: number;
};

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function optionalTrim(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

/**
 * Read n8n integration settings from process env.
 * Disabled by default — never a hard dependency for story/upload/assembly.
 */
export function readN8nConfig(env: NodeJS.ProcessEnv = process.env): N8nConfig {
  return {
    enabled: truthy(env.N8N_ENABLED),
    baseUrl: optionalTrim(env.N8N_BASE_URL),
    apiKey: optionalTrim(env.N8N_API_KEY),
    webhookSecret: optionalTrim(env.N8N_WEBHOOK_SECRET),
    workflowId: optionalTrim(env.N8N_WORKFLOW_ID),
    callbackBaseUrl: optionalTrim(env.N8N_CALLBACK_BASE_URL) ?? optionalTrim(env.APP_URL),
    timestampToleranceMs: positiveInt(env.N8N_TIMESTAMP_TOLERANCE_MS, 5 * 60 * 1000),
    maxDeliveryAttempts: positiveInt(env.N8N_MAX_DELIVERY_ATTEMPTS, 8),
    retryBaseDelayMs: positiveInt(env.N8N_RETRY_BASE_DELAY_MS, 1000),
    retryMaxDelayMs: positiveInt(env.N8N_RETRY_MAX_DELAY_MS, 60_000),
  };
}

export function isN8nConfigured(config: N8nConfig): boolean {
  return Boolean(config.enabled && config.baseUrl && config.webhookSecret);
}

export function assertSafePublicConfig(config: N8nConfig): {
  enabled: boolean;
  configured: boolean;
  baseUrlHost: string | null;
  workflowId: string | null;
  callbackBaseUrl: string | null;
} {
  let baseUrlHost: string | null = null;
  if (config.baseUrl) {
    try {
      baseUrlHost = new URL(config.baseUrl).host;
    } catch {
      baseUrlHost = 'invalid-url';
    }
  }
  return {
    enabled: config.enabled,
    configured: isN8nConfigured(config),
    baseUrlHost,
    workflowId: config.workflowId,
    callbackBaseUrl: config.callbackBaseUrl,
  };
}
