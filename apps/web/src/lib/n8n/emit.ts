import {
  buildIdempotencyKey,
  type CreateN8nEventInput,
  type EventDeliveryRecord,
  type N8nEventType,
} from '@ai-shorts-factory/n8n-integration';
import { getN8nPublisher, getOrchestrationController } from '@/lib/n8n/runtime';
import { getVideoRepository } from '@/lib/projects/repository';

/**
 * Resolve the primary video id for a project (content-platform video, else project id).
 * Events always carry a video_id for n8n correlation without inventing domain records.
 */
export async function resolveVideoIdForProject(
  userId: string,
  projectId: string,
  preferredVideoId?: string | null,
): Promise<string> {
  if (preferredVideoId) return preferredVideoId;
  try {
    const videos = await getVideoRepository();
    const listed = await videos.listByProject(userId, projectId);
    if (listed[0]?.id) return listed[0].id;
  } catch {
    // Fall through to project id for legacy memory paths.
  }
  return projectId;
}

/**
 * Fire-and-audit outbound n8n event. Never throws into caller workflows.
 */
export async function emitN8nEvent(
  input: CreateN8nEventInput,
): Promise<EventDeliveryRecord | null> {
  try {
    const publisher = getN8nPublisher();
    const record = await publisher.publish(input);

    // Keep orchestration sync timestamp fresh on successful deliveries only.
    if (record.status === 'delivered') {
      const controller = getOrchestrationController();
      await controller.patch(input.projectId, input.videoId, {
        lastSuccessfulSyncAt: record.deliveredAt ?? record.updatedAt,
        lastError: null,
      });
    }
    return record;
  } catch (error) {
    console.error('[n8n] emit failed', error);
    return null;
  }
}

export async function emitProjectEvent(input: {
  userId: string;
  projectId: string;
  videoId?: string | null;
  eventType: N8nEventType;
  sceneId?: string | null;
  idempotencyParts: Array<string | number | null | undefined>;
  status?: Record<string, string | number | boolean | null>;
  correlationId?: string;
}): Promise<EventDeliveryRecord | null> {
  const videoId = await resolveVideoIdForProject(input.userId, input.projectId, input.videoId);
  let correlationId = input.correlationId;
  if (!correlationId) {
    try {
      const orch = await getOrchestrationController().getOrCreate(input.projectId, videoId);
      correlationId = orch.correlationId ?? undefined;
    } catch {
      // optional
    }
  }

  return emitN8nEvent({
    eventType: input.eventType,
    projectId: input.projectId,
    videoId,
    sceneId: input.sceneId ?? null,
    idempotencyKey: buildIdempotencyKey([input.eventType, ...input.idempotencyParts]),
    correlationId,
    status: input.status,
  });
}
