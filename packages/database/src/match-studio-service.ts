import {
  assertMatchStudioTransition,
  emptyMatchStudioCapabilityFlags,
  parseCreateMatchStudioRun,
  type CreateMatchStudioRunPayload,
  type MatchStudioCapabilityFlags,
} from '@ai-shorts-factory/validation';
import type { MatchStudioStatus } from '@ai-shorts-factory/shared-types';
import { assertCanActivatePatch } from './game-knowledge-activation.js';
import type { GameKnowledgeRepository } from './game-knowledge-types.js';
import type { BrandRepository, ProjectDnaRepository, VideoRepository } from './content-platform-types.js';
import { createProjectWithPlatform } from './content-platform-service.js';
import type { ProjectRepository } from './types.js';
import type { MatchAnalysisRepository } from './match-analysis-types.js';
import type { MatchStudioRepository, MatchStudioRunRecord } from './match-studio-types.js';

export type MatchStudioCreateDeps = {
  brands: BrandRepository;
  projects: ProjectRepository;
  dna: ProjectDnaRepository;
  videos: VideoRepository;
  knowledge: GameKnowledgeRepository;
  studio: MatchStudioRepository;
  /**
   * When using Supabase persistence, upsert Memory KB profile/patch rows so FKs succeed.
   */
  ensureKnowledgeRefs?: (
    userId: string,
    refs: { gameProfileId: string; gamePatchId: string | null },
  ) => Promise<void>;
};

function defaultCapabilities(patchUnknown: boolean): MatchStudioCapabilityFlags {
  const audioMode = process.env.MATCH_AUDIO_DETECTOR?.trim().toLowerCase() ?? 'stub';
  const audioEvents =
    audioMode === 'heuristic' || audioMode === 'local' ? 'partial' : 'stub';
  return emptyMatchStudioCapabilityFlags({
    roster_ocr: patchUnknown ? 'unavailable' : 'partial',
    timeline: patchUnknown ? 'partial' : 'partial',
    audio_events: audioEvents,
    scoreboard: 'not_implemented',
    minimap: 'not_implemented',
    commentary: patchUnknown ? 'partial' : 'partial',
    tts: 'unavailable',
    full_match_render: 'partial',
    shorts: 'partial',
  });
}

/**
 * Create a Match Studio project (category gaming) + run row.
 * Does not create a recording yet — status starts at awaiting_upload.
 */
export async function createMatchStudioRun(
  deps: MatchStudioCreateDeps,
  userId: string,
  rawInput: CreateMatchStudioRunPayload,
): Promise<{ projectId: string; run: MatchStudioRunRecord }> {
  const input = parseCreateMatchStudioRun(rawInput);
  const profile = await deps.knowledge.getProfile(userId, input.game_profile_id);
  if (!profile) throw new Error('Game profile not found');

  let patchResolution: MatchStudioRunRecord['patch_resolution'] = 'bound';
  let gamePatchId: string | null = input.game_patch_id ?? null;

  if (input.patch_unknown) {
    patchResolution = 'unknown';
    gamePatchId = null;
  } else {
    if (!gamePatchId) throw new Error('game_patch_id required');
    const patch = await deps.knowledge.getPatch(userId, gamePatchId);
    if (!patch) throw new Error('Game patch not found');
    assertCanActivatePatch({
      requestedEnvironment: input.server_environment,
      gameProfileId: input.game_profile_id,
      patch,
    });
    if (patch.status === 'draft') patchResolution = 'draft_only';
  }

  const created = await createProjectWithPlatform(
    {
      brands: deps.brands,
      projects: deps.projects,
      dna: deps.dna,
      videos: deps.videos,
    },
    userId,
    {
      name: input.title,
      category: 'gaming',
      visual_style: 'automatic',
      language: 'en',
      niche: 'mlbb-match-studio',
      content_purpose: 'match_studio',
      universe_context: `Match Studio — ${input.server_environment}`,
      notes: [
        input.notes,
        'Match Studio project — not routed through Flow scene generation.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  );

  if (deps.ensureKnowledgeRefs) {
    await deps.ensureKnowledgeRefs(userId, {
      gameProfileId: input.game_profile_id,
      gamePatchId,
    });
  }

  const run = await deps.studio.createRun(userId, {
    project_id: created.project.id,
    title: input.title,
    status: 'awaiting_upload',
    patch_resolution: patchResolution,
    server_environment: input.server_environment,
    game_profile_id: input.game_profile_id,
    game_patch_id: gamePatchId,
    capability_flags: defaultCapabilities(Boolean(input.patch_unknown)),
  });

  return { projectId: created.project.id, run };
}

export async function transitionMatchStudioRun(
  studio: MatchStudioRepository,
  userId: string,
  runId: string,
  to: MatchStudioStatus,
  extras?: { last_error?: string | null },
): Promise<MatchStudioRunRecord> {
  const run = await studio.getRun(userId, runId);
  if (!run) throw new Error('Match Studio run not found');
  assertMatchStudioTransition(run.status, to);
  return studio.updateRun(userId, runId, {
    status: to,
    last_error: extras?.last_error !== undefined ? extras.last_error : run.last_error,
  });
}

export async function attachRecordingToMatchStudioRun(
  deps: {
    studio: MatchStudioRepository;
    analysis: MatchAnalysisRepository;
  },
  userId: string,
  runId: string,
  matchSourceId: string,
): Promise<MatchStudioRunRecord> {
  const run = await deps.studio.getRun(userId, runId);
  if (!run) throw new Error('Match Studio run not found');
  const source = await deps.analysis.getSource(userId, matchSourceId);
  if (!source) throw new Error('Match source not found');

  await deps.analysis.updateSource(userId, matchSourceId, {
    project_id: run.project_id,
    game_patch_id: run.game_patch_id,
  });

  assertMatchStudioTransition(run.status, 'ingesting');
  return deps.studio.updateRun(userId, runId, {
    match_source_id: matchSourceId,
    status: 'ingesting',
    last_error: null,
  });
}

export async function bindPatchToMatchStudioRun(
  deps: {
    studio: MatchStudioRepository;
    knowledge: GameKnowledgeRepository;
    analysis: MatchAnalysisRepository;
  },
  userId: string,
  runId: string,
  gamePatchId: string,
): Promise<MatchStudioRunRecord> {
  const run = await deps.studio.getRun(userId, runId);
  if (!run) throw new Error('Match Studio run not found');
  const patch = await deps.knowledge.getPatch(userId, gamePatchId);
  if (!patch) throw new Error('Game patch not found');
  assertCanActivatePatch({
    requestedEnvironment: run.server_environment,
    gameProfileId: run.game_profile_id,
    patch,
  });

  if (run.match_source_id) {
    await deps.analysis.updateSource(userId, run.match_source_id, {
      game_patch_id: gamePatchId,
    });
  }

  return deps.studio.updateRun(userId, runId, {
    game_patch_id: gamePatchId,
    patch_resolution: patch.status === 'published' ? 'bound' : 'draft_only',
    capability_flags: emptyMatchStudioCapabilityFlags({
      ...run.capability_flags,
      roster_ocr: 'partial',
      commentary: 'partial',
    }),
  });
}
