'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { processNextGenerationJob } from '@/lib/generation/process-job';
import { getJobQueue } from '@/lib/generation/runtime';

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
  await queue.enqueue({
    projectId,
    userId: user.id,
    jobType: 'ASSEMBLE_PROJECT',
    idempotencyKey: `assemble:${projectId}:${Date.now()}`,
    payload: { maxSeconds: 59 },
  });

  await processNextGenerationJob(`web-media-tick:${user.id}`);
  revalidateAssemble(projectId);
}
