import { createGenerationRunner, getJobQueue } from '@/lib/generation/runtime';

/**
 * Claim and run one queued generation job.
 * Used by web inline ticks (memory mode) and can be reused by a co-located worker.
 */
export async function processNextGenerationJob(workerId: string): Promise<boolean> {
  const queue = getJobQueue();
  const job = await queue.claim(workerId, 120);
  if (!job) {
    return false;
  }

  try {
    const runner = await createGenerationRunner();
    if (job.jobType === 'GENERATE_PROJECT_SCENES') {
      const result = await runner.runProject(job.userId, job.projectId, { workerId });
      if (result.failed) {
        await queue.fail(job.id, workerId, result.failed);
      } else {
        await queue.complete(job.id, workerId);
      }
    } else if (job.jobType === 'RETRY_SCENE') {
      const sceneNumber = Number(job.payload.sceneNumber);
      const result = await runner.retryScene(job.userId, job.projectId, sceneNumber, {
        workerId,
      });
      if (result.status === 'failed') {
        await queue.fail(job.id, workerId, result.message);
      } else {
        await queue.complete(job.id, workerId);
      }
    } else {
      await queue.fail(job.id, workerId, 'Unsupported job type');
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Worker failed';
    await queue.fail(job.id, workerId, message);
    return true;
  }
}
