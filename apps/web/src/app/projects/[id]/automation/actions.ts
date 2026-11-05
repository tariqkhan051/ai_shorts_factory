'use server';

import { revalidatePath } from 'next/cache';
import type { OrchestrationControlAction } from '@ai-shorts-factory/n8n-integration';
import { requireUser } from '@/lib/auth';
import { emitProjectEvent, resolveVideoIdForProject } from '@/lib/n8n/emit';
import { getN8nPublisher, getOrchestrationController } from '@/lib/n8n/runtime';
import {
  getCharacterRepository,
  getProjectRepository,
  getStoryRepository,
} from '@/lib/projects/repository';
import { AppGenerationStore } from '@/lib/generation/app-generation-store';
import { prepareScenesPromptReady } from '@/lib/generation/manual-import';

async function revalidateAutomation(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/automation`);
  revalidatePath(`/projects/${projectId}/flow-package`);
}

export async function orchestrationControlAction(
  projectId: string,
  action: OrchestrationControlAction,
): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  const projects = await getProjectRepository();
  const project = await projects.getById(user.id, projectId);
  if (!project) {
    return { ok: false, message: 'Project not found' };
  }

  const videoId = await resolveVideoIdForProject(user.id, projectId);
  const controller = getOrchestrationController();
  const record = await controller.apply(projectId, videoId, action);

  if (action === 'start') {
    // Prepare packages in-app; n8n only coordinates notifications/wait.
    try {
      await prepareScenesPromptReady(user.id, projectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to prepare scene package';
      await controller.patch(projectId, videoId, { lastError: message, status: 'failed' });
      await revalidateAutomation(projectId);
      return { ok: false, message };
    }

    await emitProjectEvent({
      userId: user.id,
      projectId,
      videoId,
      eventType: 'video.approved',
      idempotencyParts: [projectId, videoId, 'orchestration-start', record.correlationId],
      status: {
        workflow_state: project.workflow_state,
        orchestration_status: record.status,
        correlation_id: record.correlationId,
        flow_package_path: `/projects/${projectId}/flow-package`,
      },
      correlationId: record.correlationId ?? undefined,
    });

    const store = new AppGenerationStore(
      projects,
      await getStoryRepository(),
      await getCharacterRepository(),
    );
    const snapshot = await store.getProjectSnapshot(user.id, projectId);
    const next = snapshot.scenes
      .slice()
      .sort((a, b) => a.sceneNumber - b.sceneNumber)
      .find(
        (scene) =>
          scene.state === 'PROMPT_READY' ||
          scene.state === 'PENDING' ||
          scene.state === 'AWAITING_MANUAL_GENERATION',
      );
    if (next) {
      await controller.setWaiting(projectId, videoId, 'waiting_manual_generation', {
        sceneId: next.id,
        sceneNumber: next.sceneNumber,
      });
      await emitProjectEvent({
        userId: user.id,
        projectId,
        videoId,
        eventType: 'scene.awaiting_manual_generation',
        sceneId: next.id,
        idempotencyParts: [projectId, next.id, 'orch-start-await'],
        status: {
          scene_number: next.sceneNumber,
          flow_package_path: `/projects/${projectId}/flow-package`,
        },
        correlationId: record.correlationId ?? undefined,
      });
    }
  }

  await revalidateAutomation(projectId);
  return {
    ok: true,
    message: `Orchestration ${action} → ${record.status}`,
  };
}

export async function retryFailedN8nEventAction(
  projectId: string,
  eventId: string,
): Promise<{ ok: boolean; message: string }> {
  await requireUser();
  const record = await getN8nPublisher().retry(eventId);
  await revalidateAutomation(projectId);
  if (!record) {
    return { ok: false, message: 'Event not found' };
  }
  return {
    ok: true,
    message: `Retry result: ${record.status}${record.lastError ? ` (${record.lastError})` : ''}`,
  };
}
