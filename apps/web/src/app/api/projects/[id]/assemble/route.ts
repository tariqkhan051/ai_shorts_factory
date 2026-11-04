import { nextJobIdempotencyKey } from '@ai-shorts-factory/workflow-engine';
import { requireUser } from '@/lib/auth';
import { getAssemblyRecordStore } from '@/lib/assembly/runtime';
import { processNextGenerationJob } from '@/lib/generation/process-job';
import { getJobQueue } from '@/lib/generation/runtime';
import { persistMemoryStudioNow } from '@/lib/projects/repository';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = 'force-dynamic';

/** POST — run FFmpeg assembly (same path as the Assemble page button). */
export async function POST(_request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
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

  try {
    await processNextGenerationJob(`api-media-tick:${user.id}`);
    await persistMemoryStudioNow();
    const record = await getAssemblyRecordStore().getByProject(user.id, projectId);
    return Response.json({ ok: true, record });
  } catch (error) {
    const record = await getAssemblyRecordStore().getByProject(user.id, projectId);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Assembly failed',
        record,
      },
      { status: 500 },
    );
  }
}
