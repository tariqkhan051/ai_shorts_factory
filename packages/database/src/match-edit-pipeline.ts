import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  probeMedia,
  renderMatchEdit,
  resolveMediaToolPaths,
  type MatchEditCutSegment,
} from '@ai-shorts-factory/media-engine';
import { BUSINESS_DEFAULTS, MATCH_EDIT_DEFAULTS } from '@ai-shorts-factory/shared-types';
import type {
  MatchCommentaryScript,
  MatchEditArtifact,
  MatchEditPlan,
} from '@ai-shorts-factory/validation';
import { buildCondensedCaptionCues, buildShortCaptionCues } from './match-edit-captions.js';
import { buildMatchEditPlan } from './match-edit-plan.js';
import type { MatchEditRepository, MatchEditStored } from './match-edit-types.js';
import { MemoryMatchEditRepository } from './memory-match-edit-repository.js';
import type { MatchTimelineRepository } from './match-event-types.js';

export type AssembleMatchEditInput = {
  userId: string;
  timelineId: string;
  sourceVideoPath: string;
  workDir: string;
  outputDir: string;
  timelines: MatchTimelineRepository;
  edits: MatchEditRepository;
  commentary?: MatchCommentaryScript | null;
  burnCaptions?: boolean;
  planConfig?: Parameters<typeof buildMatchEditPlan>[0]['config'];
};

export type AssembleMatchEditResult = {
  plan: MatchEditPlan;
  edit: MatchEditStored;
  artifacts: MatchEditArtifact[];
};

function toCuts(plan: MatchEditPlan): MatchEditCutSegment[] {
  return plan.condensed_segments.map((segment) => ({
    sourceStartSeconds: segment.source_start_seconds,
    sourceEndSeconds: segment.source_end_seconds,
    speed: segment.speed,
  }));
}

/**
 * Plan + render one condensed vertical edit and up to two Shorts from verified timeline events.
 * Distribution still requires `approveMatchEditForDistribution`.
 */
export async function assembleMatchEditFromTimeline(
  input: AssembleMatchEditInput,
): Promise<AssembleMatchEditResult> {
  const timeline = await input.timelines.getTimeline(input.userId, input.timelineId);
  if (!timeline) {
    throw new Error(`Timeline not found: ${input.timelineId}`);
  }

  const paths = resolveMediaToolPaths();
  const probe = await probeMedia(paths, input.sourceVideoPath);
  if (!probe.hasVideo || probe.durationSeconds <= 0) {
    throw new Error(`Source is not a readable video: ${input.sourceVideoPath}`);
  }

  const plan = buildMatchEditPlan({
    timeline,
    sourceDurationSeconds: probe.durationSeconds,
    config: input.planConfig,
  });
  await input.edits.savePlan(input.userId, plan);

  const memory =
    input.edits instanceof MemoryMatchEditRepository
      ? input.edits
      : null;
  const editBase =
    memory?.createEmptyEdit(input.userId, plan) ??
    ({
      id: randomUUID(),
      user_id: input.userId,
      plan,
      status: 'planned' as const,
      artifacts: [],
      approved_at: null,
      notes: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } satisfies MatchEditStored);

  const artifacts: MatchEditArtifact[] = [];
  const burnCaptions = input.burnCaptions ?? Boolean(input.commentary);

  const condensedPath = join(input.outputDir, `condensed-${plan.id}.mp4`);
  const condensedCues = buildCondensedCaptionCues({
    plan,
    commentary: input.commentary,
  });
  const condensed = await renderMatchEdit({
    sourceVideoPath: input.sourceVideoPath,
    segments: toCuts(plan),
    workDir: join(input.workDir, 'condensed'),
    outputPath: condensedPath,
    profile: 'condensed',
    maxSeconds: plan.config.condensed_max_seconds,
    burnCaptions,
    captionCues: condensedCues,
    paths,
  });

  artifacts.push({
    kind: 'condensed',
    short_rank: null,
    path: condensed.outputPath,
    duration_seconds: condensed.durationSeconds,
    width: condensed.probe.width ?? BUSINESS_DEFAULTS.finalVideoTargetWidth,
    height: condensed.probe.height ?? BUSINESS_DEFAULTS.finalVideoTargetHeight,
    burned_captions: condensed.burnedCaptions,
    quality_ok: condensed.quality.ok,
    quality_notes: condensed.quality.ok ? condensed.quality.notes : condensed.quality.failures,
  });

  for (const short of plan.shorts) {
    const shortPath = join(input.outputDir, `short-${short.rank}-${short.id}.mp4`);
    const shortCues = buildShortCaptionCues({
      short,
      commentary: input.commentary,
    });
    const rendered = await renderMatchEdit({
      sourceVideoPath: input.sourceVideoPath,
      segments: [
        {
          sourceStartSeconds: short.source_start_seconds,
          sourceEndSeconds: short.source_end_seconds,
          speed: 1,
        },
      ],
      workDir: join(input.workDir, `short-${short.rank}`),
      outputPath: shortPath,
      profile: 'short',
      maxSeconds: Math.min(
        short.duration_seconds,
        plan.config.short_max_seconds,
        MATCH_EDIT_DEFAULTS.short_max_seconds,
      ),
      burnCaptions,
      captionCues: shortCues,
      paths,
    });
    artifacts.push({
      kind: 'short',
      short_rank: short.rank,
      path: rendered.outputPath,
      duration_seconds: rendered.durationSeconds,
      width: rendered.probe.width ?? BUSINESS_DEFAULTS.finalVideoTargetWidth,
      height: rendered.probe.height ?? BUSINESS_DEFAULTS.finalVideoTargetHeight,
      burned_captions: rendered.burnedCaptions,
      quality_ok: rendered.quality.ok,
      quality_notes: rendered.quality.ok ? rendered.quality.notes : rendered.quality.failures,
    });
  }

  const edit: MatchEditStored = {
    ...editBase,
    plan,
    status: 'rendered',
    artifacts,
    updated_at: new Date().toISOString(),
  };
  const saved = await input.edits.saveEdit(input.userId, edit);
  return { plan, edit: saved, artifacts };
}
