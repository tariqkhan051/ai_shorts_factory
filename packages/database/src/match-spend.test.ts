import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryCreditLedger } from '@ai-shorts-factory/credit-manager';
import { emptyMatchSpendFlags } from '@ai-shorts-factory/validation';
import {
  assertMatchSpendAllowed,
  recordMatchUnknownSpend,
  reserveMatchSpend,
} from './match-spend.js';
import {
  MemoryMatchCacheMetricsRepository,
  recordMatchCacheAccess,
  summarizeMatchCacheMetrics,
} from './match-cache-metrics.js';

const userId = '11111111-1111-1111-1111-111111111111';

describe('match spend + cache metrics (Milestone 7)', () => {
  let ledger: MemoryCreditLedger;

  beforeEach(() => {
    ledger = new MemoryCreditLedger({ dailyBudget: 50 });
  });

  it('blocks paid vision and TTS when flags default off', async () => {
    const flags = emptyMatchSpendFlags();
    expect(flags.paid_vision_enabled).toBe(false);
    expect(flags.tts_spend_enabled).toBe(false);

    expect(assertMatchSpendAllowed('match_vision', flags).ok).toBe(false);
    expect(assertMatchSpendAllowed('tts', flags).ok).toBe(false);

    const blocked = await reserveMatchSpend({
      ledger,
      userId,
      flags,
      attempt: {
        domain: 'match_vision',
        estimated_credits: 5,
        idempotency_key: 'vision-1',
        reason: 'cloud OCR',
      },
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.blocked_by_flag).toBe(true);
  });

  it('records ledger spend only when the domain flag is enabled', async () => {
    const flags = emptyMatchSpendFlags({ paid_vision_enabled: true });
    const reserved = await reserveMatchSpend({
      ledger,
      userId,
      flags,
      attempt: {
        domain: 'match_vision',
        estimated_credits: 3,
        idempotency_key: 'vision-2',
        reason: 'cloud OCR batch',
      },
    });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(reserved.reservation?.amount).toBe(3);

    const unknown = await recordMatchUnknownSpend({
      ledger,
      userId,
      flags: emptyMatchSpendFlags({ tts_spend_enabled: true }),
      amount: 'unknown',
      attempt: {
        domain: 'tts',
        idempotency_key: 'tts-1',
        reason: 'operator-reported TTS burn',
      },
    });
    expect(unknown.ok).toBe(true);
  });

  it('tracks roster/timeline cache hit rates', async () => {
    const metrics = new MemoryMatchCacheMetricsRepository();
    await recordMatchCacheAccess({ userId, kind: 'roster', hit: true, metrics });
    await recordMatchCacheAccess({ userId, kind: 'roster', hit: false, metrics });
    await recordMatchCacheAccess({ userId, kind: 'timeline', hit: true, metrics });

    const snapshot = await metrics.getMetrics(userId);
    expect(snapshot.roster_hits).toBe(1);
    expect(snapshot.roster_misses).toBe(1);
    expect(snapshot.timeline_hits).toBe(1);

    const summary = summarizeMatchCacheMetrics(snapshot);
    expect(summary.roster_hit_rate).toBe(0.5);
    expect(summary.timeline_hit_rate).toBe(1);
    expect(summary.total_accesses).toBe(3);
  });
});
