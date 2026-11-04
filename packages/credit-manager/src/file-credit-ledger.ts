import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MemoryCreditLedger } from './memory-credit-ledger.js';
import type {
  CreditBalances,
  CreditLedger,
  CreditLedgerEntry,
  CreditReservation,
  ReserveCreditsInput,
} from './types.js';

type PersistedShape = {
  version: 1;
  dailyBudget: number;
  snapshot: ReturnType<MemoryCreditLedger['exportSnapshot']>;
};

/**
 * Durable credit ledger: MemoryCreditLedger semantics + atomic JSON persistence.
 */
export class FileCreditLedger implements CreditLedger {
  private readonly inner: MemoryCreditLedger;
  private readonly filePath: string;
  private readonly dailyBudget: number;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options?: { filePath?: string; dailyBudget?: number }) {
    this.dailyBudget = options?.dailyBudget ?? 50;
    this.filePath =
      options?.filePath ??
      process.env.ASF_CREDIT_LEDGER_PATH?.trim() ??
      join(process.cwd(), '.data', 'credit-ledger.json');
    this.inner = new MemoryCreditLedger({ dailyBudget: this.dailyBudget });
    this.hydrateSync();
  }

  private hydrateSync(): void {
    try {
      if (!existsSync(this.filePath)) {
        mkdirSync(dirname(this.filePath), { recursive: true });
        return;
      }
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedShape;
      if (parsed.version === 1 && parsed.snapshot) {
        this.inner.importSnapshot(parsed.snapshot);
      }
    } catch {
      // Corrupt/missing file → start empty; next mutation rewrites.
    }
  }

  private async persist(): Promise<void> {
    const payload: PersistedShape = {
      version: 1,
      dailyBudget: this.dailyBudget,
      snapshot: this.inner.exportSnapshot(),
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${Date.now()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await rename(tmp, this.filePath);
  }

  private async withPersist<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(async () => {
      const result = await fn();
      await this.persist();
      return result;
    });
    this.writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  getBalances(userId: string): Promise<CreditBalances> {
    return this.inner.getBalances(userId);
  }

  listEntries(userId: string): Promise<CreditLedgerEntry[]> {
    return this.inner.listEntries(userId);
  }

  reserve(input: ReserveCreditsInput): Promise<CreditReservation> {
    return this.withPersist(() => this.inner.reserve(input));
  }

  confirmSpend(
    reservationId: string,
    actualAmount: number,
    metadata?: Record<string, unknown>,
  ): Promise<CreditReservation> {
    return this.withPersist(() => this.inner.confirmSpend(reservationId, actualAmount, metadata));
  }

  markUnknown(
    reservationId: string,
    metadata?: Record<string, unknown>,
  ): Promise<CreditReservation> {
    return this.withPersist(() => this.inner.markUnknown(reservationId, metadata));
  }

  releaseReservation(
    reservationId: string,
    metadata?: Record<string, unknown>,
  ): Promise<CreditReservation> {
    return this.withPersist(() => this.inner.releaseReservation(reservationId, metadata));
  }

  manualReconcile(input: {
    userId: string;
    amount: number;
    reason: string;
    projectId?: string;
    idempotencyKey?: string;
  }): Promise<CreditLedgerEntry> {
    return this.withPersist(() => this.inner.manualReconcile(input));
  }

  recordUnknownConsumption(input: {
    userId: string;
    projectId?: string;
    amount: number | 'unknown';
    reason: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<CreditLedgerEntry> {
    return this.withPersist(() => this.inner.recordUnknownConsumption(input));
  }
}
