import { nextJobIdempotencyKey } from '@ai-shorts-factory/workflow-engine';
import { requireUser } from '@/lib/auth';
import { processNextGenerationJob } from '@/lib/generation/process-job';
import { getJobQueue } from '@/lib/generation/runtime';
import { getNotificationPublisher } from '@/lib/notifications/runtime';
import { getProjectRepository, persistMemoryStudioNow } from '@/lib/projects/repository';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = 'force-dynamic';

/** POST — start/resume mock generation (same path as the Generate page button). */
export async function POST(_request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  const user = await requireUser();
  const projects = await getProjectRepository();
  const project = await projects.getById(user.id, projectId);
  if (!project) {
    return Response.json({ ok: false, error: 'Project not found' }, { status: 404 });
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
  await processNextGenerationJob(`api-tick:${user.id}`);
  await persistMemoryStudioNow();

  const updated = await projects.getById(user.id, projectId);
  const publisher = await getNotificationPublisher();
  publisher.publishProjectUpdated(user.id, projectId);

  return Response.json({
    ok: true,
    workflowState: updated?.workflow_state ?? null,
  });
}
