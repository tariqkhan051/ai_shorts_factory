'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  attachRecordingToMatchStudioRun,
  bindPatchToMatchStudioRun,
  createMatchStudioRun,
  ingestMatchVideo,
  transitionMatchStudioRun,
} from '@ai-shorts-factory/database';
import { parseCreateMatchStudioRun } from '@ai-shorts-factory/validation';
import {
  probeMedia,
  readMatchIngestContractFromEnv,
  resolveMediaToolPaths,
  validateMatchIngestProbe,
} from '@ai-shorts-factory/media-engine';
import { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import {
  getBrandRepository,
  getGameKnowledgeRepository,
  getProjectDnaRepository,
  getProjectRepository,
  getVideoRepository,
  persistGameKnowledgeNow,
  persistMemoryStudioNow,
} from '@/lib/projects/repository';
import {
  createMatchStudioKnowledgeEnsure,
  getMatchAnalysisRepository,
  getMatchJobQueue,
  getMatchStudioRepository,
} from '@/lib/match-studio/runtime';

export type MatchStudioActionState = {
  ok: boolean;
  message?: string;
  errors?: string[];
  runId?: string;
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createMatchStudioRunAction(
  _prev: MatchStudioActionState,
  formData: FormData,
): Promise<MatchStudioActionState> {
  try {
    const user = await requireUser();
    const patchUnknown = formString(formData, 'patch_unknown') === 'on';
    const payload = parseCreateMatchStudioRun({
      title: formString(formData, 'title'),
      server_environment: formString(formData, 'server_environment') || 'original',
      game_profile_id: formString(formData, 'game_profile_id'),
      game_patch_id: patchUnknown ? null : formString(formData, 'game_patch_id') || null,
      patch_unknown: patchUnknown,
      notes: formString(formData, 'notes'),
    });

    const knowledge = await getGameKnowledgeRepository();
    const { run } = await createMatchStudioRun(
      {
        brands: await getBrandRepository(),
        projects: await getProjectRepository(),
        dna: await getProjectDnaRepository(),
        videos: await getVideoRepository(),
        knowledge,
        studio: await getMatchStudioRepository(),
        ensureKnowledgeRefs: await createMatchStudioKnowledgeEnsure(knowledge),
      },
      user.id,
      payload,
    );

    await persistMemoryStudioNow();
    await persistGameKnowledgeNow();
    revalidatePath('/match-studio');
    redirect(`/match-studio/${run.id}`);
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        message: 'Validation failed',
        errors: error.issues.map((i) => i.message),
      };
    }
    // Next.js redirect throws; rethrow
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to create Match Studio run',
    };
  }
}

export async function registerMatchRecordingAction(
  runId: string,
  _prev: MatchStudioActionState,
  formData: FormData,
): Promise<MatchStudioActionState> {
  try {
    const user = await requireUser();
    const studio = await getMatchStudioRepository();
    const analysis = await getMatchAnalysisRepository();
    const knowledge = await getGameKnowledgeRepository();
    const run = await studio.getRun(user.id, runId);
    if (!run) return { ok: false, message: 'Run not found' };

    const localPath = formString(formData, 'local_path');
    if (!localPath) return { ok: false, message: 'local_path is required' };

    const paths = resolveMediaToolPaths();
    const probe = await probeMedia(paths, localPath);
    const contract = readMatchIngestContractFromEnv();
    const validated = validateMatchIngestProbe(probe, contract);
    if (!validated.ok) {
      return {
        ok: false,
        message: 'Recording failed Match Studio ingest validation',
        errors: validated.violations.map((v) => v.message),
      };
    }

    const source = await ingestMatchVideo(analysis, knowledge, user.id, {
      title: run.title,
      local_path: localPath,
      server_environment: run.server_environment,
      game_patch_id: run.game_patch_id,
      project_id: run.project_id,
      duration_seconds: probe.durationSeconds,
      probe_json: {
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        durationSeconds: probe.durationSeconds,
        hasAudio: probe.hasAudio,
        videoCodec: probe.videoCodec,
        audioCodec: probe.audioCodec,
      },
      ingest_status: 'validated',
      original_filename: formString(formData, 'original_filename') || localPath,
    });

    await attachRecordingToMatchStudioRun({ studio, analysis }, user.id, runId, source.id);
    await transitionMatchStudioRun(studio, user.id, runId, 'ready_for_analysis');

    const queue = await getMatchJobQueue();
    await queue.enqueue({
      projectId: run.project_id,
      userId: user.id,
      jobType: 'MATCH_INGEST_PROBE',
      idempotencyKey: `match-ingest:${source.id}:${source.content_checksum_sha256 ?? 'na'}`,
      payload: {
        matchStudioRunId: runId,
        matchSourceId: source.id,
      },
    });

    revalidatePath(`/match-studio/${runId}`);
    return { ok: true, message: 'Recording registered and validated', runId };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to register recording',
    };
  }
}

export async function bindMatchStudioPatchAction(
  runId: string,
  _prev: MatchStudioActionState,
  formData: FormData,
): Promise<MatchStudioActionState> {
  try {
    const user = await requireUser();
    const patchId = formString(formData, 'game_patch_id');
    await bindPatchToMatchStudioRun(
      {
        studio: await getMatchStudioRepository(),
        knowledge: await getGameKnowledgeRepository(),
        analysis: await getMatchAnalysisRepository(),
      },
      user.id,
      runId,
      patchId,
    );
    revalidatePath(`/match-studio/${runId}`);
    return { ok: true, message: 'Patch bound' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to bind patch',
    };
  }
}

export async function advanceMatchStudioStatusAction(
  runId: string,
  to: string,
): Promise<MatchStudioActionState> {
  try {
    const user = await requireUser();
    await transitionMatchStudioRun(
      await getMatchStudioRepository(),
      user.id,
      runId,
      to as Parameters<typeof transitionMatchStudioRun>[3],
    );
    revalidatePath(`/match-studio/${runId}`);
    return { ok: true, message: `Moved to ${to}` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Transition failed',
    };
  }
}

export async function cancelMatchStudioJobAction(
  runId: string,
  jobId: string,
): Promise<MatchStudioActionState> {
  try {
    const user = await requireUser();
    await (await getMatchJobQueue()).cancel(jobId, user.id, 'Cancelled from Match Studio UI');
    revalidatePath(`/match-studio/${runId}`);
    return { ok: true, message: 'Job cancelled' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Cancel failed',
    };
  }
}
