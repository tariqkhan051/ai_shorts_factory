'use server';

import { revalidatePath } from 'next/cache';
import { nextJobIdempotencyKey } from '@ai-shorts-factory/workflow-engine';
import { requireUser } from '@/lib/auth';
import { processNextGenerationJob } from '@/lib/generation/process-job';
import { getJobQueue } from '@/lib/generation/runtime';
import { persistMemoryStudioNow } from '@/lib/projects/repository';

function revalidateAssemble(projectId: string) {
  revalidatePath('/');
  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/generate`);
  revalidatePath(`/projects/${projectId}/assemble`);
}

/**
 * Enqueue assembly and run an inline media tick for memory-mode local demos.
 * Production should prefer apps/media-worker with a shared job queue.
 */
export async function startAssemblyAction(projectId: string): Promise<void> {
  const user = await requireUser();
  const queue = getJobQueue();
  const { idempotencyKey } = await nextJobIdempotencyKey(
    queue,
    projectId,
    'ASSEMBLE_PROJECT',
    `assemble:${projectId}`,
  );
  await queue.enqueue({
    projectId,
    userId: user.id,
    jobType: 'ASSEMBLE_PROJECT',
    idempotencyKey,
    payload: { maxSeconds: 59 },
  });

  await processNextGenerationJob(`web-media-tick:${user.id}`);
  await persistMemoryStudioNow();
  revalidateAssemble(projectId);
}
