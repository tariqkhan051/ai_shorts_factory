'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { processNextGenerationJob } from '@/lib/generation/process-job';
import { getCreditLedger, getJobQueue } from '@/lib/generation/runtime';
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
  await queue.enqueue({
    projectId,
    userId: user.id,
    jobType: 'GENERATE_PROJECT_SCENES',
    idempotencyKey: `generate:${projectId}:${Date.now()}`,
    payload: { mode: 'mock' },
  });

  await processNextGenerationJob(`web-tick:${user.id}`);
  revalidateGeneration(projectId);
}

export async function retryFailedSceneAction(
  projectId: string,
  sceneNumber: number,
): Promise<void> {
  const user = await requireUser();
  const queue = getJobQueue();
  await queue.enqueue({
    projectId,
    userId: user.id,
    jobType: 'RETRY_SCENE',
    idempotencyKey: `retry:${projectId}:scene:${sceneNumber}:${Date.now()}`,
    payload: { sceneNumber, mode: 'mock' },
  });
  await processNextGenerationJob(`web-tick-retry:${user.id}`);
  revalidateGeneration(projectId);
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
