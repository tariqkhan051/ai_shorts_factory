export const CREDIT_ENTRY_TYPES = [
  'CONFIGURED_BALANCE',
  'RESERVE',
  'CONFIRM_SPEND',
  'RELEASE_RESERVE',
  'UNKNOWN_CONSUMPTION',
  'MANUAL_RECONCILE',
  'REFUND',
] as const;

export type CreditEntryType = (typeof CREDIT_ENTRY_TYPES)[number];

export type CreditLedgerEntry = {
  id: string;
  userId: string;
  projectId?: string;
  generationJobId?: string;
  reservationId?: string;
  entryType: CreditEntryType;
  /** Positive increases available/configured; negative decreases. Semantics depend on entryType. */
  amount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CreditReservation = {
  id: string;
  userId: string;
  projectId?: string;
  generationJobId?: string;
  amount: number;
  status: 'reserved' | 'confirmed' | 'released' | 'unknown';
  createdAt: string;
  settledAt?: string;
  confirmedAmount?: number | 'unknown';
};

export type CreditBalances = {
  dailyBudget: number;
  configuredAvailable: number;
  reserved: number;
  confirmedSpent: number;
  unknownConsumption: number;
  /** available = configuredAvailable - reserved (unknown does not auto-refund) */
  spendable: number;
};

export type ReserveCreditsInput = {
  userId: string;
  amount: number;
  projectId?: string;
  generationJobId?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

export interface CreditLedger {
  getBalances(userId: string): Promise<CreditBalances>;
  listEntries(userId: string): Promise<CreditLedgerEntry[]>;
  reserve(input: ReserveCreditsInput): Promise<CreditReservation>;
  confirmSpend(
    reservationId: string,
    actualAmount: number,
    metadata?: Record<string, unknown>,
  ): Promise<CreditReservation>;
  markUnknown(
    reservationId: string,
    metadata?: Record<string, unknown>,
  ): Promise<CreditReservation>;
  releaseReservation(
    reservationId: string,
    metadata?: Record<string, unknown>,
  ): Promise<CreditReservation>;
  manualReconcile(input: {
    userId: string;
    amount: number;
    reason: string;
    projectId?: string;
  }): Promise<CreditLedgerEntry>;
}
