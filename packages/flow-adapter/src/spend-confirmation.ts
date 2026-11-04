import { createHash, randomBytes } from 'node:crypto';

/**
 * Explicit operator confirmation before real Google Flow credit spend.
 * Tokens are short-lived and scoped to one project + scene. Never auto-spend.
 */

export type LiveSpendConfirmationPayload = {
  token: string;
  projectId: string;
  sceneNumber: number;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  durationSeconds: number;
  estimatedCreditCost: number | 'unknown' | 'estimated';
  createdAt: string;
  expiresAt: string;
  phrase: 'SPEND_REAL_CREDITS';
};

const CONFIRM_PHRASE = 'SPEND_REAL_CREDITS' as const;

export function createLiveSpendConfirmation(input: {
  projectId: string;
  sceneNumber: number;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  durationSeconds: number;
  estimatedCreditCost: number | 'unknown' | 'estimated';
  ttlMs?: number;
}): LiveSpendConfirmationPayload {
  const createdAt = new Date();
  const ttlMs = input.ttlMs ?? 30 * 60_000;
  const expiresAt = new Date(createdAt.getTime() + ttlMs);
  const token = `asf_live_${randomBytes(16).toString('hex')}`;

  return {
    token,
    projectId: input.projectId,
    sceneNumber: input.sceneNumber,
    prompt: input.prompt,
    model: input.model,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    durationSeconds: input.durationSeconds,
    estimatedCreditCost: input.estimatedCreditCost,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    phrase: CONFIRM_PHRASE,
  };
}

export function hashSpendConfirmationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function assertLiveSpendConfirmation(input: {
  confirmation: LiveSpendConfirmationPayload;
  projectId: string;
  sceneNumber: number;
  typedPhrase: string;
  providedToken: string;
  now?: Date;
}): void {
  const now = input.now ?? new Date();
  if (input.providedToken !== input.confirmation.token) {
    throw new Error('Spend confirmation token mismatch');
  }
  if (input.confirmation.projectId !== input.projectId) {
    throw new Error('Spend confirmation is for a different project');
  }
  if (input.confirmation.sceneNumber !== input.sceneNumber) {
    throw new Error('Spend confirmation is for a different scene');
  }
  if (Date.parse(input.confirmation.expiresAt) <= now.getTime()) {
    throw new Error('Spend confirmation expired — generate a new preflight confirmation');
  }
  if (input.typedPhrase.trim() !== CONFIRM_PHRASE) {
    throw new Error(`Type ${CONFIRM_PHRASE} exactly to authorize real Google Flow credit spend`);
  }
}

export { CONFIRM_PHRASE as LIVE_SPEND_CONFIRM_PHRASE };
