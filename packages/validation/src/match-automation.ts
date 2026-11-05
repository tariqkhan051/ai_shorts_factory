import { z } from 'zod';
import {
  MATCH_AUTOMATION_DEFAULTS,
  MATCH_SPEND_DOMAINS,
} from '@ai-shorts-factory/shared-types';

export const MATCH_SPEND_FLAGS_SCHEMA_VERSION = 'match-spend-flags-v1' as const;
export const MATCH_CACHE_METRICS_SCHEMA_VERSION = 'match-cache-metrics-v1' as const;

/** Feature flags for paid match automation — defaults all false. */
export const matchSpendFlagsSchema = z.object({
  schema_version: z.literal(MATCH_SPEND_FLAGS_SCHEMA_VERSION).default(MATCH_SPEND_FLAGS_SCHEMA_VERSION),
  paid_vision_enabled: z.boolean().default(MATCH_AUTOMATION_DEFAULTS.paid_vision_enabled),
  tts_spend_enabled: z.boolean().default(MATCH_AUTOMATION_DEFAULTS.tts_spend_enabled),
  allow_remote_artifact_fetch: z
    .boolean()
    .default(MATCH_AUTOMATION_DEFAULTS.allow_remote_artifact_fetch),
});

export const matchSpendAttemptSchema = z.object({
  domain: z.enum(MATCH_SPEND_DOMAINS),
  estimated_credits: z.number().min(0).max(1_000_000).optional(),
  idempotency_key: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(500),
  metadata: z.record(z.unknown()).default({}),
});

export const matchCacheMetricsSchema = z.object({
  schema_version: z.literal(MATCH_CACHE_METRICS_SCHEMA_VERSION),
  roster_hits: z.number().int().min(0).default(0),
  roster_misses: z.number().int().min(0).default(0),
  timeline_hits: z.number().int().min(0).default(0),
  timeline_misses: z.number().int().min(0).default(0),
  updated_at: z.string().datetime(),
});

export type MatchSpendFlags = z.infer<typeof matchSpendFlagsSchema>;
export type MatchSpendAttempt = z.infer<typeof matchSpendAttemptSchema>;
export type MatchCacheMetrics = z.infer<typeof matchCacheMetricsSchema>;

export function emptyMatchSpendFlags(overrides: Partial<MatchSpendFlags> = {}): MatchSpendFlags {
  return matchSpendFlagsSchema.parse(overrides);
}

export function emptyMatchCacheMetrics(
  overrides: Partial<Omit<MatchCacheMetrics, 'schema_version'>> = {},
): MatchCacheMetrics {
  return matchCacheMetricsSchema.parse({
    schema_version: MATCH_CACHE_METRICS_SCHEMA_VERSION,
    updated_at: new Date().toISOString(),
    ...overrides,
  });
}

export function parseMatchSpendFlags(input: unknown): MatchSpendFlags {
  return matchSpendFlagsSchema.parse(input);
}

/**
 * Read spend flags from env. Missing / non-true values stay false (safe default).
 */
export function readMatchSpendFlagsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MatchSpendFlags {
  const truthy = (value: string | undefined) => value?.trim().toLowerCase() === 'true';
  return emptyMatchSpendFlags({
    paid_vision_enabled: truthy(env.MATCH_PAID_VISION_ENABLED),
    tts_spend_enabled: truthy(env.MATCH_TTS_SPEND_ENABLED),
    allow_remote_artifact_fetch: truthy(env.MATCH_ALLOW_REMOTE_ARTIFACT_FETCH),
  });
}
