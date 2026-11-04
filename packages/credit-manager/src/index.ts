/**
 * Package: @ai-shorts-factory/credit-manager
 * Transactional credit ledger, reservations, and reconciliation
 *
 * Phase 0: scaffold only. Real implementation lands in later phases.
 * Do not treat this package as production-ready.
 */
export const PACKAGE_NAME = '@ai-shorts-factory/credit-manager' as const;
export const PACKAGE_PHASE = 0 as const;
export const PACKAGE_STATUS = 'scaffold' as const;

export function getPackageMeta() {
  return {
    name: PACKAGE_NAME,
    phase: PACKAGE_PHASE,
    status: PACKAGE_STATUS,
    description: 'Transactional credit ledger, reservations, and reconciliation',
  } as const;
}
