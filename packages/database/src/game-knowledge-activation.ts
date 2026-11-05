import type { GameServerEnvironment } from '@ai-shorts-factory/shared-types';
import { GAME_SERVER_ENVIRONMENT_LABELS } from '@ai-shorts-factory/shared-types';
import type {
  AbilityKnowledgeRecord,
  GamePatchRecord,
} from './game-knowledge-types.js';

export class GameKnowledgeActivationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GameKnowledgeActivationError';
    this.code = code;
  }
}

export function assertPatchPublished(patch: GamePatchRecord): void {
  if (patch.status !== 'published') {
    throw new GameKnowledgeActivationError(
      'PATCH_NOT_PUBLISHED',
      `Only published patches can be activated (patch ${patch.patch_code} is ${patch.status}). Draft knowledge must not drive live commentary.`,
    );
  }
}

export function assertPatchEnvironmentMatch(
  requested: GameServerEnvironment,
  patch: GamePatchRecord,
): void {
  if (patch.server_environment !== requested) {
    throw new GameKnowledgeActivationError(
      'ENVIRONMENT_MISMATCH',
      `Cannot bind ${GAME_SERVER_ENVIRONMENT_LABELS[patch.server_environment]} patch "${patch.patch_code}" to a ${GAME_SERVER_ENVIRONMENT_LABELS[requested]} match. Original and Advance knowledge must never mix.`,
    );
  }
}

export function assertPatchBelongsToProfile(
  patch: GamePatchRecord,
  gameProfileId: string,
): void {
  if (patch.game_profile_id !== gameProfileId) {
    throw new GameKnowledgeActivationError(
      'PATCH_PROFILE_MISMATCH',
      `Patch "${patch.patch_code}" does not belong to the requested game profile.`,
    );
  }
}

export function assertPatchMutable(patch: GamePatchRecord): void {
  if (patch.status === 'published' || patch.status === 'archived') {
    throw new GameKnowledgeActivationError(
      'PATCH_IMMUTABLE',
      `Published/archived patch "${patch.patch_code}" is immutable. Create a new draft patch to record changes.`,
    );
  }
}

/**
 * Original Server activation must never expose experimental (Advance) abilities.
 * Advance Server may include experimental abilities.
 */
export function filterAbilitiesForEnvironment(
  environment: GameServerEnvironment,
  abilities: AbilityKnowledgeRecord[],
): AbilityKnowledgeRecord[] {
  if (environment === 'advance') {
    return abilities;
  }
  return abilities.filter((ability) => !ability.experimental);
}

export function assertNoExperimentalLeak(
  environment: GameServerEnvironment,
  abilities: AbilityKnowledgeRecord[],
): void {
  if (environment !== 'original') return;
  const leaked = abilities.filter((a) => a.experimental);
  if (leaked.length > 0) {
    throw new GameKnowledgeActivationError(
      'EXPERIMENTAL_ABILITY_LEAK',
      `Original Server activation cannot include experimental abilities: ${leaked
        .map((a) => a.ability_key)
        .join(', ')}.`,
    );
  }
}

export function assertCanActivatePatch(input: {
  requestedEnvironment: GameServerEnvironment;
  gameProfileId: string;
  patch: GamePatchRecord;
}): void {
  assertPatchBelongsToProfile(input.patch, input.gameProfileId);
  assertPatchPublished(input.patch);
  assertPatchEnvironmentMatch(input.requestedEnvironment, input.patch);
}
