import type { MatchCommentaryScript } from '@ai-shorts-factory/validation';
import { assertCanActivatePatch } from './game-knowledge-activation.js';
import type { GameKnowledgeRepository } from './game-knowledge-types.js';
import {
  buildMatchCommentary,
  type BuildMatchCommentaryInput,
  type BuildMatchCommentaryResult,
} from './match-commentary-builder.js';
import { applyMatchCommentaryPolish } from './match-commentary-polish.js';
import type { MatchTimelineRepository } from './match-event-types.js';

/**
 * Resolve activated patch knowledge for a timeline and build grounded commentary.
 */
export async function generateGroundedMatchCommentary(input: {
  userId: string;
  matchSourceId: string;
  timelineId: string;
  knowledge: GameKnowledgeRepository;
  timelines: MatchTimelineRepository;
  includeColorHook?: boolean;
  language?: string;
  knowledgeContext?: BuildMatchCommentaryInput['knowledgeContext'];
}): Promise<BuildMatchCommentaryResult> {
  const timeline = await input.timelines.getTimeline(input.userId, input.timelineId);
  if (!timeline) throw new Error('Timeline not found');
  if (timeline.match_source_id !== input.matchSourceId) {
    throw new Error('Timeline does not belong to the given match source');
  }

  const patch = await input.knowledge.getPatch(input.userId, timeline.game_patch_id);
  if (!patch) throw new Error('Game patch not found');
  assertCanActivatePatch({
    requestedEnvironment: timeline.server_environment,
    gameProfileId: patch.game_profile_id,
    patch,
  });

  const knowledge = await input.knowledge.resolveActivatedKnowledge(input.userId, {
    server_environment: timeline.server_environment,
    game_patch_id: timeline.game_patch_id,
  });

  return buildMatchCommentary({
    matchSourceId: input.matchSourceId,
    timeline,
    knowledge,
    includeColorHook: input.includeColorHook,
    language: input.language,
    knowledgeContext: input.knowledgeContext,
  });
}

export async function polishGroundedMatchCommentary(input: {
  userId: string;
  base: MatchCommentaryScript;
  polishedJson: string;
  knowledge: GameKnowledgeRepository;
  timelines: MatchTimelineRepository;
}) {
  const timeline = await input.timelines.getTimeline(input.userId, input.base.timeline_id);
  if (!timeline) throw new Error('Timeline not found');

  if (!input.base.game_patch_id) {
    throw new Error('Cannot polish commentary without a bound game_patch_id');
  }
  const knowledge = await input.knowledge.resolveActivatedKnowledge(input.userId, {
    server_environment: input.base.server_environment,
    game_patch_id: input.base.game_patch_id,
  });

  return applyMatchCommentaryPolish({
    base: input.base,
    polishedJson: input.polishedJson,
    events: timeline.events,
    knowledge,
  });
}
