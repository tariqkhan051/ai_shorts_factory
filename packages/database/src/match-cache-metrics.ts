import { emptyMatchCacheMetrics, type MatchCacheMetrics } from '@ai-shorts-factory/validation';

export type MatchCacheKind = 'roster' | 'timeline';

export interface MatchCacheMetricsRepository {
  getMetrics(userId: string): Promise<MatchCacheMetrics>;
  saveMetrics(userId: string, metrics: MatchCacheMetrics): Promise<MatchCacheMetrics>;
}

export class MemoryMatchCacheMetricsRepository implements MatchCacheMetricsRepository {
  private readonly byUser = new Map<string, MatchCacheMetrics>();

  clear(): void {
    this.byUser.clear();
  }

  async getMetrics(userId: string): Promise<MatchCacheMetrics> {
    const existing = this.byUser.get(userId);
    return existing
      ? structuredClone(existing)
      : emptyMatchCacheMetrics({ updated_at: new Date().toISOString() });
  }

  async saveMetrics(userId: string, metrics: MatchCacheMetrics): Promise<MatchCacheMetrics> {
    const saved = structuredClone(metrics);
    this.byUser.set(userId, saved);
    return structuredClone(saved);
  }
}

/**
 * Record a roster/timeline analysis cache hit or miss for operator metrics.
 */
export async function recordMatchCacheAccess(input: {
  userId: string;
  kind: MatchCacheKind;
  hit: boolean;
  metrics: MatchCacheMetricsRepository;
}): Promise<MatchCacheMetrics> {
  const current = await input.metrics.getMetrics(input.userId);
  const next = emptyMatchCacheMetrics({
    roster_hits: current.roster_hits + (input.kind === 'roster' && input.hit ? 1 : 0),
    roster_misses: current.roster_misses + (input.kind === 'roster' && !input.hit ? 1 : 0),
    timeline_hits: current.timeline_hits + (input.kind === 'timeline' && input.hit ? 1 : 0),
    timeline_misses:
      current.timeline_misses + (input.kind === 'timeline' && !input.hit ? 1 : 0),
    updated_at: new Date().toISOString(),
  });
  return input.metrics.saveMetrics(input.userId, next);
}

export function summarizeMatchCacheMetrics(metrics: MatchCacheMetrics): {
  roster_hit_rate: number | null;
  timeline_hit_rate: number | null;
  total_accesses: number;
} {
  const rosterTotal = metrics.roster_hits + metrics.roster_misses;
  const timelineTotal = metrics.timeline_hits + metrics.timeline_misses;
  return {
    roster_hit_rate: rosterTotal === 0 ? null : metrics.roster_hits / rosterTotal,
    timeline_hit_rate: timelineTotal === 0 ? null : metrics.timeline_hits / timelineTotal,
    total_accesses: rosterTotal + timelineTotal,
  };
}
