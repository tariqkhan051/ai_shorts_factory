'use server';

import { revalidatePath } from 'next/cache';
import {
  createLiveSpendConfirmation,
  describeFlowProviderStatus,
  LIVE_SPEND_CONFIRM_PHRASE,
  assertLiveSpendConfirmation,
  resolveLiveMaxScenes,
  readFlowLiveConfig,
  isLiveFlowProviderName,
} from '@ai-shorts-factory/flow-adapter';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import { nextJobIdempotencyKey } from '@ai-shorts-factory/workflow-engine';
import { requireUser } from '@/lib/auth';
import { AppGenerationStore } from '@/lib/generation/app-generation-store';
import { processNextGenerationJob } from '@/lib/generation/process-job';
import { getCreditLedger, getJobQueue } from '@/lib/generation/runtime';
import {
  consumeSpendConfirmation,
  saveSpendConfirmation,
} from '@/lib/generation/spend-confirmations';
import { getNotificationPublisher } from '@/lib/notifications/runtime';
import {
  getCharacterRepository,
  getProjectRepository,
  getStoryRepository,
  persistMemoryStudioNow,
} from '@/lib/projects/repository';

function revalidateGeneration(projectId: string) {
  revalidatePath('/');
  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/generate`);
  revalidatePath(`/projects/${projectId}/story`);
  revalidatePath('/settings');
}

export type LiveCanaryPreflight = {
  projectId: string;
  projectName: string;
  sceneNumber: 1;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  durationSeconds: number;
  estimatedCreditCost: number | 'unknown' | 'estimated';
  spendableCredits: number;
  sessionStatus: string;
  sessionMessage: string;
  gatesOk: boolean;
  gateReasons: string[];
  canaryOnly: boolean;
  maxLiveScenesPerProject: number;
  confirmationToken: string;
  confirmPhrase: typeof LIVE_SPEND_CONFIRM_PHRASE;
  workerCommand: string;
  warnings: string[];
};

/**
 * Enqueue mock generation and process one worker tick inline.
 * Memory-mode queues are process-local; the same claim/complete APIs are used
 * by apps/flow-worker once a shared (Postgres) queue lands.
 */
export async function startMockGenerationAction(projectId: string): Promise<void> {
  const user = await requireUser();
  const projects = await getProjectRepository();
  const project = await projects.getById(user.id, projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const queue = getJobQueue();
  const { idempotencyKey } = await nextJobIdempotencyKey(
    queue,
    projectId,
    'GENERATE_PROJECT_SCENES',
    `generate:${projectId}`,
  );
  await queue.enqueue({
    projectId,
    userId: user.id,
    jobType: 'GENERATE_PROJECT_SCENES',
    idempotencyKey,
    payload: { mode: 'mock' },
  });

  await processNextGenerationJob(`web-tick:${user.id}`);
  await publishGenerationOutcome(user.id, projectId);
  await persistMemoryStudioNow();
  revalidateGeneration(projectId);
}

export async function retryFailedSceneAction(
  projectId: string,
  sceneNumber: number,
): Promise<void> {
  const user = await requireUser();
  const queue = getJobQueue();
  const { idempotencyKey } = await nextJobIdempotencyKey(
    queue,
    projectId,
    'RETRY_SCENE',
    `retry:${projectId}:scene:${sceneNumber}`,
  );
  await queue.enqueue({
    projectId,
    userId: user.id,
    jobType: 'RETRY_SCENE',
    idempotencyKey,
    payload: { sceneNumber, mode: 'mock' },
  });
  await processNextGenerationJob(`web-tick-retry:${user.id}`);
  await publishGenerationOutcome(user.id, projectId);
  await persistMemoryStudioNow();
  revalidateGeneration(projectId);
}

/**
 * Build a live canary preflight report + spend confirmation token.
 * Does NOT submit to Google Flow and does NOT spend credits.
 */
export async function prepareLiveCanaryPreflightAction(
  projectId: string,
): Promise<LiveCanaryPreflight> {
  const user = await requireUser();
  const projects = await getProjectRepository();
  const stories = await getStoryRepository();
  const characters = await getCharacterRepository();
  const project = await projects.getById(user.id, projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const story = await stories.getByProject(user.id, projectId);
  if (!story?.approved_at || !story.current_version?.screenplay) {
    throw new Error('Approve a five-scene screenplay before live canary');
  }

  const flow = describeFlowProviderStatus(process.env);
  const config = readFlowLiveConfig(process.env);
  if (!isLiveFlowProviderName(config.provider) || !config.liveEnabled) {
    throw new Error(
      'Set FLOW_PROVIDER=google-flow (or playwright), FLOW_LIVE_ENABLED=true, and complete live gates before canary preflight.',
    );
  }

  const store = new AppGenerationStore(projects, stories, characters);
  const scenes = await store.ensureScenesFromScreenplay(
    user.id,
    projectId,
    story.current_version.screenplay,
  );
  const scene1 = scenes.find((scene) => scene.sceneNumber === 1);
  if (!scene1) {
    throw new Error('Scene 1 missing from approved screenplay');
  }
  if (scene1.state === 'COMPLETED') {
    throw new Error('Scene 1 is already COMPLETED — canary will not regenerate it');
  }
  if (scene1.state === 'UNKNOWN_SUBMISSION' || scene1.submissionAttempted) {
    throw new Error(
      'Scene 1 has an uncertain prior submission. Reconcile credits manually before a new live attempt.',
    );
  }

  const credits = await getCreditLedger().getBalances(user.id);
  const warnings: string[] = [];
  if (!flow.gatesOk) {
    warnings.push(...flow.gateReasons);
  }
  if (credits.spendable < (typeof config.estimatedCostPerScene === 'number' ? config.estimatedCostPerScene : 0)) {
    warnings.push('Spendable credit budget may be insufficient for the estimated scene cost');
  }
  if (config.canaryOnly && resolveLiveMaxScenes(config) !== 1) {
    warnings.push('Canary mode expects FLOW_MAX_LIVE_SCENES_PER_PROJECT=1');
  }

  const confirmation = createLiveSpendConfirmation({
    projectId,
    sceneNumber: 1,
    prompt: scene1.flowPrompt,
    model: config.model,
    aspectRatio: config.aspectRatio,
    resolution: config.resolution,
    durationSeconds: config.durationSeconds,
    estimatedCreditCost:
      typeof config.estimatedCostPerScene === 'number' ? 'estimated' : 'unknown',
  });
  saveSpendConfirmation(confirmation);

  const workerCommand = [
    'FLOW_PROVIDER=google-flow',
    'FLOW_LIVE_ENABLED=true',
    'FLOW_CANARY_ONLY=true',
    'FLOW_MAX_LIVE_SCENES_PER_PROJECT=1',
    `FLOW_SPEND_CONFIRMATION_TOKEN=${confirmation.token}`,
    `FLOW_SPEND_CONFIRM_PHRASE=${LIVE_SPEND_CONFIRM_PHRASE}`,
    `FLOW_CANARY_PROJECT_ID=${projectId}`,
    `FLOW_CANARY_USER_ID=${user.id}`,
    'pnpm --filter @ai-shorts-factory/flow-worker canary:scene',
  ].join(' ');

  return {
    projectId,
    projectName: project.name,
    sceneNumber: 1,
    prompt: scene1.flowPrompt,
    model: config.model,
    aspectRatio: config.aspectRatio,
    resolution: config.resolution,
    durationSeconds: config.durationSeconds,
    estimatedCreditCost:
      typeof config.estimatedCostPerScene === 'number' ? 'estimated' : 'unknown',
    spendableCredits: credits.spendable,
    sessionStatus: flow.session.status,
    sessionMessage: flow.session.message,
    gatesOk: flow.gatesOk,
    gateReasons: flow.gateReasons,
    canaryOnly: config.canaryOnly,
    maxLiveScenesPerProject: resolveLiveMaxScenes(config),
    confirmationToken: confirmation.token,
    confirmPhrase: LIVE_SPEND_CONFIRM_PHRASE,
    workerCommand,
    warnings,
  };
}

/**
 * Validates the operator typed the spend phrase. Still does NOT auto-run live generation
 * from the web process (Playwright stays in flow-worker). Returns the worker command.
 */
export async function confirmLiveCanarySpendAction(
  projectId: string,
  token: string,
  typedPhrase: string,
): Promise<{ ok: true; workerCommand: string; message: string }> {
  const user = await requireUser();
  const confirmation = consumeSpendConfirmation(token) ?? undefined;
  if (!confirmation) {
    throw new Error('Spend confirmation token missing or already used — run preflight again');
  }

  assertLiveSpendConfirmation({
    confirmation,
    projectId,
    sceneNumber: 1,
    typedPhrase,
    providedToken: token,
  });

  // Re-save as authorized so the worker can redeem once.
  saveSpendConfirmation({
    ...confirmation,
    // Keep same token; worker redeems with phrase env.
  });

  const workerCommand = [
    'FLOW_PROVIDER=google-flow',
    'FLOW_LIVE_ENABLED=true',
    'FLOW_CANARY_ONLY=true',
    'FLOW_MAX_LIVE_SCENES_PER_PROJECT=1',
    `FLOW_SPEND_CONFIRMATION_TOKEN=${token}`,
    `FLOW_SPEND_CONFIRM_PHRASE=${LIVE_SPEND_CONFIRM_PHRASE}`,
    `FLOW_CANARY_PROJECT_ID=${projectId}`,
    `FLOW_CANARY_USER_ID=${user.id}`,
    'pnpm --filter @ai-shorts-factory/flow-worker canary:scene',
  ].join(' ');

  revalidateGeneration(projectId);
  return {
    ok: true,
    workerCommand,
    message:
      'Spend authorized for Scene 1 canary only. Run the flow-worker canary command below. This web action does not submit to Google Flow.',
  };
}

async function publishGenerationOutcome(userId: string, projectId: string): Promise<void> {
  const projects = await getProjectRepository();
  const project = await projects.getById(userId, projectId);
  if (!project) return;
  const publisher = await getNotificationPublisher();
  publisher.publishProjectUpdated(userId, projectId);

  if (project.workflow_state === 'ASSEMBLY_READY') {
    await publisher.publish({
      userId,
      projectId,
      type: 'generation_completed',
      title: 'Scene generation complete',
      body: `${project.name} is ready for FFmpeg assembly.`,
      href: `/projects/${projectId}/assemble`,
    });
    return;
  }

  if (project.workflow_state === 'NEEDS_HUMAN_INTERVENTION') {
    await publisher.publish({
      userId,
      projectId,
      type: 'needs_intervention',
      title: 'Human intervention required',
      body: `${project.name} needs attention before generation can continue.`,
      href: `/projects/${projectId}/generate`,
    });
    return;
  }

  if (project.workflow_state === 'PAUSED' || project.workflow_state === 'FAILED') {
    await publisher.publish({
      userId,
      projectId,
      type: 'generation_failed',
      title: 'Generation paused',
      body: `${project.name} stopped before all scenes completed. Retry failed scenes manually.`,
      href: `/projects/${projectId}/generate`,
    });
  }
}

export async function getCreditSnapshotAction(): Promise<{
  dailyBudget: number;
  configuredAvailable: number;
  reserved: number;
  confirmedSpent: number;
  unknownConsumption: number;
  spendable: number;
}> {
  const user = await requireUser();
  return getCreditLedger().getBalances(user.id);
}

export { BUSINESS_DEFAULTS, LIVE_SPEND_CONFIRM_PHRASE };
