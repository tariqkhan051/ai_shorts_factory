import type { CreditLedger, CreditLedgerEntry, CreditReservation } from '@ai-shorts-factory/credit-manager';
import {
  emptyMatchSpendFlags,
  matchSpendAttemptSchema,
  readMatchSpendFlagsFromEnv,
  type MatchSpendAttempt,
  type MatchSpendFlags,
} from '@ai-shorts-factory/validation';

export type MatchSpendGateResult =
  | { ok: true; flags: MatchSpendFlags }
  | { ok: false; error: string; flags: MatchSpendFlags };

export type RecordMatchSpendResult =
  | { ok: true; reservation?: CreditReservation; entry?: CreditLedgerEntry; skipped?: false }
  | { ok: false; error: string; blocked_by_flag: boolean };

/**
 * Assert paid vision/TTS spend is allowed. Defaults deny.
 */
export function assertMatchSpendAllowed(
  domain: MatchSpendAttempt['domain'],
  flags: MatchSpendFlags = readMatchSpendFlagsFromEnv(),
): MatchSpendGateResult {
  if (domain === 'match_vision' && !flags.paid_vision_enabled) {
    return {
      ok: false,
      flags,
      error:
        'Paid match vision is disabled (MATCH_PAID_VISION_ENABLED defaults false). Use local OCR.',
    };
  }
  if (domain === 'tts' && !flags.tts_spend_enabled) {
    return {
      ok: false,
      flags,
      error: 'TTS spend is disabled (MATCH_TTS_SPEND_ENABLED defaults false).',
    };
  }
  if (flags.allow_remote_artifact_fetch) {
    // Remote fetch is a separate dangerous flag; spend gate still returns ok for ledger.
  }
  return { ok: true, flags };
}

/**
 * Reserve credits for a paid match domain only when the corresponding flag is on.
 * Never invents Moonton spend; operator/automation must pass explicit estimates.
 */
export async function reserveMatchSpend(input: {
  ledger: CreditLedger;
  userId: string;
  attempt: MatchSpendAttempt | unknown;
  flags?: MatchSpendFlags;
  projectId?: string;
}): Promise<RecordMatchSpendResult> {
  const attempt = matchSpendAttemptSchema.parse(input.attempt);
  const flags = input.flags ?? readMatchSpendFlagsFromEnv();
  const gate = assertMatchSpendAllowed(attempt.domain, flags);
  if (!gate.ok) {
    return { ok: false, error: gate.error, blocked_by_flag: true };
  }

  const amount = attempt.estimated_credits;
  if (amount == null || amount <= 0) {
    return {
      ok: false,
      error: 'estimated_credits must be a positive number to reserve match spend',
      blocked_by_flag: false,
    };
  }

  const reservation = await input.ledger.reserve({
    userId: input.userId,
    amount,
    projectId: input.projectId,
    idempotencyKey: attempt.idempotency_key,
    metadata: {
      domain: attempt.domain,
      reason: attempt.reason,
      plane: 'match_intelligence',
      ...attempt.metadata,
    },
  });

  return { ok: true, reservation };
}

/**
 * Record unknown paid consumption (operator-reported) when magnitude may be unclear.
 * Still blocked when the domain flag is off.
 */
export async function recordMatchUnknownSpend(input: {
  ledger: CreditLedger;
  userId: string;
  attempt: MatchSpendAttempt | unknown;
  flags?: MatchSpendFlags;
  projectId?: string;
  amount?: number | 'unknown';
}): Promise<RecordMatchSpendResult> {
  const attempt = matchSpendAttemptSchema.parse(input.attempt);
  const flags = input.flags ?? emptyMatchSpendFlags();
  const gate = assertMatchSpendAllowed(attempt.domain, flags);
  if (!gate.ok) {
    return { ok: false, error: gate.error, blocked_by_flag: true };
  }

  const entry = await input.ledger.recordUnknownConsumption({
    userId: input.userId,
    projectId: input.projectId,
    amount: input.amount ?? attempt.estimated_credits ?? 'unknown',
    reason: attempt.reason,
    idempotencyKey: attempt.idempotency_key,
    metadata: {
      domain: attempt.domain,
      plane: 'match_intelligence',
      ...attempt.metadata,
    },
  });

  return { ok: true, entry };
}

export { readMatchSpendFlagsFromEnv, emptyMatchSpendFlags };
