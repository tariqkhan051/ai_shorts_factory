import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileCreditLedger } from './file-credit-ledger.js';
import { MemoryCreditLedger } from './memory-credit-ledger.js';

describe('unknown consumption + durable ledger', () => {
  it('keeps unknown consumption unknown (never zero confirmed spend)', async () => {
    const ledger = new MemoryCreditLedger({ dailyBudget: 50 });
    await ledger.recordUnknownConsumption({
      userId: 'u1',
      projectId: 'p1',
      amount: 'unknown',
      reason: 'operator reported unknown Flow spend',
      idempotencyKey: 'unk-1',
    });
    const balances = await ledger.getBalances('u1');
    expect(balances.confirmedSpent).toBe(0);
    expect(balances.unknownConsumption).toBeGreaterThan(0);

    const again = await ledger.recordUnknownConsumption({
      userId: 'u1',
      projectId: 'p1',
      amount: 'unknown',
      reason: 'duplicate',
      idempotencyKey: 'unk-1',
    });
    const entries = await ledger.listEntries('u1');
    expect(entries.filter((e) => e.entryType === 'UNKNOWN_CONSUMPTION')).toHaveLength(1);
    expect(again.metadata.idempotencyKey).toBe('unk-1');
  });

  it('manual reconciliation is append-only and idempotent', async () => {
    const ledger = new MemoryCreditLedger({ dailyBudget: 50 });
    const first = await ledger.manualReconcile({
      userId: 'u1',
      amount: -10,
      reason: 'confirm scene 1',
      idempotencyKey: 'rec-1',
    });
    const second = await ledger.manualReconcile({
      userId: 'u1',
      amount: -10,
      reason: 'confirm scene 1 again',
      idempotencyKey: 'rec-1',
    });
    expect(second.id).toBe(first.id);
    const entries = await ledger.listEntries('u1');
    expect(entries.filter((e) => e.entryType === 'MANUAL_RECONCILE')).toHaveLength(1);
    expect(first.metadata.flowSpendAutoVerified).toBe(false);
  });

  it('persists ledger across FileCreditLedger restarts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'asf-credits-'));
    const filePath = join(dir, 'ledger.json');
    try {
      const first = new FileCreditLedger({ filePath, dailyBudget: 50 });
      await first.recordUnknownConsumption({
        userId: 'u1',
        amount: 10,
        reason: 'estimated unknown',
        idempotencyKey: 'persist-unk',
      });
      await first.manualReconcile({
        userId: 'u1',
        amount: -5,
        reason: 'partial reconcile',
        idempotencyKey: 'persist-rec',
      });

      const second = new FileCreditLedger({ filePath, dailyBudget: 50 });
      const balances = await second.getBalances('u1');
      expect(balances.unknownConsumption).toBe(10);
      expect(balances.confirmedSpent).toBe(0);
      const entries = await second.listEntries('u1');
      expect(entries.some((e) => e.entryType === 'UNKNOWN_CONSUMPTION')).toBe(true);
      expect(entries.some((e) => e.entryType === 'MANUAL_RECONCILE')).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
