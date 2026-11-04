'use server';

import { revalidatePath } from 'next/cache';
import { nextJobIdempotencyKey } from '@ai-shorts-factory/workflow-engine';
import { requireUser } from '@/lib/auth';
import { processNextGenerationJob } from '@/lib/generation/process-job';
import { getCreditLedger, getJobQueue } from '@/lib/generation/runtime';
import { getNotificationPublisher } from '@/lib/notifications/runtime';
import { getProjectRepository } from '@/lib/projects/repository';

function revalidateGeneration(projectId: string) {
  revalidatePath('/');
  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/generate`);
  revalidatePath(`/projects/${projectId}/story`);
}

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
  revalidateGeneration(projectId);
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
