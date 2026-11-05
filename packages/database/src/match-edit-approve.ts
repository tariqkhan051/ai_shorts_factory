import { APPROVE_MATCH_DISTRIBUTION_PHRASE } from '@ai-shorts-factory/shared-types';
import type { MatchEditRepository, MatchEditStored } from './match-edit-types.js';

export type ApproveMatchEditResult =
  | { ok: true; edit: MatchEditStored }
  | { ok: false; error: string };

/**
 * Human approval gate before match edit / Shorts may be treated as distribution-ready.
 */
export async function approveMatchEditForDistribution(input: {
  userId: string;
  editId: string;
  confirmationPhrase: string;
  edits: MatchEditRepository;
}): Promise<ApproveMatchEditResult> {
  if (input.confirmationPhrase.trim() !== APPROVE_MATCH_DISTRIBUTION_PHRASE) {
    return {
      ok: false,
      error: `Confirmation phrase must be exactly ${APPROVE_MATCH_DISTRIBUTION_PHRASE}`,
    };
  }

  const edit = await input.edits.getEdit(input.userId, input.editId);
  if (!edit) {
    return { ok: false, error: 'Match edit not found' };
  }
  if (edit.status !== 'rendered') {
    return {
      ok: false,
      error: `Edit must be status "rendered" before approval (got "${edit.status}")`,
    };
  }
  if (edit.artifacts.length === 0) {
    return { ok: false, error: 'Cannot approve an edit with no rendered artifacts' };
  }
  if (edit.artifacts.some((a) => !a.quality_ok)) {
    return { ok: false, error: 'Cannot approve: one or more artifacts failed quality gates' };
  }

  const approved: MatchEditStored = {
    ...edit,
    status: 'approved',
    approved_at: new Date().toISOString(),
  };
  const saved = await input.edits.saveEdit(input.userId, approved);
  return { ok: true, edit: saved };
}
