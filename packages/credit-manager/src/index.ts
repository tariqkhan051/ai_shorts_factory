/**
 * Package: @ai-shorts-factory/credit-manager
 * Transactional credit ledger, reservations, and reconciliation.
 */

export const PACKAGE_NAME = '@ai-shorts-factory/credit-manager' as const;
export const PACKAGE_PHASE = 3 as const;
export const PACKAGE_STATUS = 'active' as const;

export type {
  CreditEntryType,
  CreditLedgerEntry,
  CreditReservation,
  CreditBalances,
  ReserveCreditsInput,
  CreditLedger,
} from './types.js';
export { CREDIT_ENTRY_TYPES } from './types.js';
export { MemoryCreditLedger } from './memory-credit-ledger.js';
export { FileCreditLedger } from './file-credit-ledger.js';

export function getPackageMeta() {
  return {
    name: PACKAGE_NAME,
    phase: PACKAGE_PHASE,
    status: PACKAGE_STATUS,
    description: 'Transactional credit ledger, reservations, and reconciliation',
  } as const;
}
