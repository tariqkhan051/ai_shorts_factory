import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryCreditLedger } from './memory-credit-ledger.js';

describe('MemoryCreditLedger', () => {
  const ledger = new MemoryCreditLedger({ dailyBudget: 50 });
  const userId = 'user-1';

  beforeEach(() => {
    ledger.clear();
  });

  it('reserves credits idempotently and prevents overspend', async () => {
    const first = await ledger.reserve({
      userId,
      amount: 10,
      idempotencyKey: 'scene-1',
    });
    const second = await ledger.reserve({
      userId,
      amount: 10,
      idempotencyKey: 'scene-1',
    });
    expect(second.id).toBe(first.id);

    const balances = await ledger.getBalances(userId);
    expect(balances.reserved).toBe(10);
    expect(balances.spendable).toBe(40);

    await expect(
      ledger.reserve({ userId, amount: 50, idempotencyKey: 'too-much' }),
    ).rejects.toThrow(/Insufficient credits/i);
  });

  it('confirms actual spend without inferring refunds as separate auto logic', async () => {
    const reservation = await ledger.reserve({
      userId,
      amount: 10,
      idempotencyKey: 'confirm-1',
    });
    await ledger.confirmSpend(reservation.id, 10);
    const balances = await ledger.getBalances(userId);
    expect(balances.reserved).toBe(0);
    expect(balances.confirmedSpent).toBe(10);
    expect(balances.spendable).toBe(40);
  });

  it('marks uncertain consumption as unknown instead of releasing as zero', async () => {
    const reservation = await ledger.reserve({
      userId,
      amount: 10,
      idempotencyKey: 'unknown-1',
    });
    await ledger.markUnknown(reservation.id, { reason: 'timeout_uncertain' });
    const balances = await ledger.getBalances(userId);
    expect(balances.unknownConsumption).toBe(10);
    expect(balances.reserved).toBe(0);
    expect(balances.spendable).toBe(40);
  });

  it('releases only when submission is known not to have occurred', async () => {
    const reservation = await ledger.reserve({
      userId,
      amount: 10,
      idempotencyKey: 'release-1',
    });
    await ledger.releaseReservation(reservation.id, { reason: 'pre_submit_failure' });
    const balances = await ledger.getBalances(userId);
    expect(balances.reserved).toBe(0);
    expect(balances.confirmedSpent).toBe(0);
    expect(balances.unknownConsumption).toBe(0);
    expect(balances.spendable).toBe(50);
  });
});
