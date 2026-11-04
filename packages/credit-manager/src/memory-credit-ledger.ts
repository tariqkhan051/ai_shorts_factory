import { randomUUID } from 'node:crypto';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import type {
  CreditBalances,
  CreditLedger,
  CreditLedgerEntry,
  CreditReservation,
  ReserveCreditsInput,
} from './types.js';

type UserCreditState = {
  configuredAvailable: number;
  entries: CreditLedgerEntry[];
  reservations: Map<string, CreditReservation>;
  reserveIdempotency: Map<string, string>;
};

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * In-memory immutable ledger with transactional reservation semantics.
 * Corrections are compensating entries only — never mutate past rows.
 */
export class MemoryCreditLedger implements CreditLedger {
  private readonly users = new Map<string, UserCreditState>();
  private readonly dailyBudget: number;

  constructor(options?: { dailyBudget?: number }) {
    this.dailyBudget = options?.dailyBudget ?? BUSINESS_DEFAULTS.dailyFlowCreditBudget;
  }

  async getBalances(userId: string): Promise<CreditBalances> {
    const state = this.ensureUser(userId);
    return this.computeBalances(state);
  }

  async listEntries(userId: string): Promise<CreditLedgerEntry[]> {
    return [...this.ensureUser(userId).entries].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }

  async reserve(input: ReserveCreditsInput): Promise<CreditReservation> {
    if (input.amount <= 0) {
      throw new Error('Reservation amount must be positive');
    }

    const state = this.ensureUser(input.userId);
    const existingId = state.reserveIdempotency.get(input.idempotencyKey);
    if (existingId) {
      const existing = state.reservations.get(existingId);
      if (!existing) {
        throw new Error('Idempotent reservation missing');
      }
      return structuredClone(existing);
    }

    const balances = this.computeBalances(state);
    if (balances.spendable < input.amount) {
      throw new Error(
        `Insufficient credits: need ${input.amount}, spendable ${balances.spendable}`,
      );
    }

    const reservation: CreditReservation = {
      id: randomUUID(),
      userId: input.userId,
      projectId: input.projectId,
      generationJobId: input.generationJobId,
      amount: input.amount,
      status: 'reserved',
      createdAt: nowIso(),
    };

    const entry: CreditLedgerEntry = {
      id: randomUUID(),
      userId: input.userId,
      projectId: input.projectId,
      generationJobId: input.generationJobId,
      reservationId: reservation.id,
      entryType: 'RESERVE',
      amount: -input.amount,
      metadata: {
        idempotencyKey: input.idempotencyKey,
        ...(input.metadata ?? {}),
      },
      createdAt: nowIso(),
    };

    state.reservations.set(reservation.id, reservation);
    state.reserveIdempotency.set(input.idempotencyKey, reservation.id);
    state.entries.push(entry);
    return structuredClone(reservation);
  }

  async confirmSpend(
    reservationId: string,
    actualAmount: number,
    metadata?: Record<string, unknown>,
  ): Promise<CreditReservation> {
    if (actualAmount < 0) {
      throw new Error('Confirmed spend cannot be negative');
    }

    const { state, reservation } = this.requireReservation(reservationId);
    if (reservation.status !== 'reserved') {
      throw new Error(`Reservation ${reservationId} is ${reservation.status}`);
    }

    // Settle reservation hold, then record confirmed spend as immutable entries.
    state.entries.push({
      id: randomUUID(),
      userId: reservation.userId,
      projectId: reservation.projectId,
      generationJobId: reservation.generationJobId,
      reservationId,
      entryType: 'RELEASE_RESERVE',
      amount: reservation.amount,
      metadata: { reason: 'settle_before_confirm', ...(metadata ?? {}) },
      createdAt: nowIso(),
    });

    state.entries.push({
      id: randomUUID(),
      userId: reservation.userId,
      projectId: reservation.projectId,
      generationJobId: reservation.generationJobId,
      reservationId,
      entryType: 'CONFIRM_SPEND',
      amount: -actualAmount,
      metadata: {
        reservedAmount: reservation.amount,
        actualAmount,
        ...(metadata ?? {}),
      },
      createdAt: nowIso(),
    });

    // If actual < reserved, restore the unused portion to configured available
    // via the RELEASE + CONFIRM pair above (RELEASE restores full reserve,
    // CONFIRM deducts actual). No inferred refund entry beyond that settlement.

    const updated: CreditReservation = {
      ...reservation,
      status: 'confirmed',
      confirmedAmount: actualAmount,
      settledAt: nowIso(),
    };
    state.reservations.set(reservationId, updated);
    return structuredClone(updated);
  }

  async markUnknown(
    reservationId: string,
    metadata?: Record<string, unknown>,
  ): Promise<CreditReservation> {
    const { state, reservation } = this.requireReservation(reservationId);
    if (reservation.status !== 'reserved') {
      throw new Error(`Reservation ${reservationId} is ${reservation.status}`);
    }

    // Keep the hold as unknown consumption — do NOT assume zero spend.
    state.entries.push({
      id: randomUUID(),
      userId: reservation.userId,
      projectId: reservation.projectId,
      generationJobId: reservation.generationJobId,
      reservationId,
      entryType: 'UNKNOWN_CONSUMPTION',
      amount: -reservation.amount,
      metadata: {
        note: 'Consumption uncertain; reservation converted to unknown',
        reservedAmount: reservation.amount,
        ...(metadata ?? {}),
      },
      createdAt: nowIso(),
    });

    // Release the reserved bucket accounting (unknown tracked separately).
    state.entries.push({
      id: randomUUID(),
      userId: reservation.userId,
      projectId: reservation.projectId,
      generationJobId: reservation.generationJobId,
      reservationId,
      entryType: 'RELEASE_RESERVE',
      amount: reservation.amount,
      metadata: { reason: 'convert_to_unknown', ...(metadata ?? {}) },
      createdAt: nowIso(),
    });

    const updated: CreditReservation = {
      ...reservation,
      status: 'unknown',
      confirmedAmount: 'unknown',
      settledAt: nowIso(),
    };
    state.reservations.set(reservationId, updated);
    return structuredClone(updated);
  }

  async releaseReservation(
    reservationId: string,
    metadata?: Record<string, unknown>,
  ): Promise<CreditReservation> {
    const { state, reservation } = this.requireReservation(reservationId);
    if (reservation.status !== 'reserved') {
      throw new Error(`Reservation ${reservationId} is ${reservation.status}`);
    }

    // Only for cases where submission is known not to have occurred.
    state.entries.push({
      id: randomUUID(),
      userId: reservation.userId,
      projectId: reservation.projectId,
      generationJobId: reservation.generationJobId,
      reservationId,
      entryType: 'RELEASE_RESERVE',
      amount: reservation.amount,
      metadata: {
        reason: 'known_unsubmitted',
        ...(metadata ?? {}),
      },
      createdAt: nowIso(),
    });

    const updated: CreditReservation = {
      ...reservation,
      status: 'released',
      settledAt: nowIso(),
    };
    state.reservations.set(reservationId, updated);
    return structuredClone(updated);
  }

  async manualReconcile(input: {
    userId: string;
    amount: number;
    reason: string;
    projectId?: string;
  }): Promise<CreditLedgerEntry> {
    const state = this.ensureUser(input.userId);
    const entry: CreditLedgerEntry = {
      id: randomUUID(),
      userId: input.userId,
      projectId: input.projectId,
      entryType: 'MANUAL_RECONCILE',
      amount: input.amount,
      metadata: { reason: input.reason },
      createdAt: nowIso(),
    };
    state.entries.push(entry);
    state.configuredAvailable += input.amount;
    return structuredClone(entry);
  }

  clear(): void {
    this.users.clear();
  }

  private ensureUser(userId: string): UserCreditState {
    let state = this.users.get(userId);
    if (!state) {
      const bootstrap: CreditLedgerEntry = {
        id: randomUUID(),
        userId,
        entryType: 'CONFIGURED_BALANCE',
        amount: this.dailyBudget,
        metadata: { source: 'daily_budget_default' },
        createdAt: nowIso(),
      };
      state = {
        configuredAvailable: this.dailyBudget,
        entries: [bootstrap],
        reservations: new Map(),
        reserveIdempotency: new Map(),
      };
      this.users.set(userId, state);
    }
    return state;
  }

  private requireReservation(reservationId: string): {
    state: UserCreditState;
    reservation: CreditReservation;
  } {
    for (const state of this.users.values()) {
      const reservation = state.reservations.get(reservationId);
      if (reservation) {
        return { state, reservation };
      }
    }
    throw new Error(`Reservation not found: ${reservationId}`);
  }

  private computeBalances(state: UserCreditState): CreditBalances {
    let reserved = 0;
    let confirmedSpent = 0;
    let unknownConsumption = 0;
    let configuredAvailable = 0;

    for (const entry of state.entries) {
      switch (entry.entryType) {
        case 'CONFIGURED_BALANCE':
        case 'MANUAL_RECONCILE':
        case 'REFUND':
          configuredAvailable += entry.amount;
          break;
        case 'RESERVE':
          reserved += Math.abs(entry.amount);
          break;
        case 'RELEASE_RESERVE':
          reserved -= entry.amount;
          break;
        case 'CONFIRM_SPEND':
          confirmedSpent += Math.abs(entry.amount);
          configuredAvailable += entry.amount; // entry.amount is negative
          break;
        case 'UNKNOWN_CONSUMPTION':
          unknownConsumption += Math.abs(entry.amount);
          configuredAvailable += entry.amount; // treat as unavailable until reconciled
          break;
        default:
          break;
      }
    }

    reserved = Math.max(0, reserved);
    const spendable = configuredAvailable - reserved;

    return {
      dailyBudget: this.dailyBudget,
      configuredAvailable,
      reserved,
      confirmedSpent,
      unknownConsumption,
      spendable,
    };
  }
}
