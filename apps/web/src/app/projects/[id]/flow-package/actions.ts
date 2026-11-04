'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import {
  importManualSceneVideo,
  markSceneAwaitingManualGeneration,
  prepareScenesPromptReady,
  updateSceneFlowPrompt,
} from '@/lib/generation/manual-import';

export async function prepareFlowPackageAction(projectId: string) {
  const user = await requireUser();
  await prepareScenesPromptReady(user.id, projectId);
  revalidatePath(`/projects/${projectId}/flow-package`);
  revalidatePath(`/projects/${projectId}/generate`);
}

export async function markAwaitingManualGenerationAction(projectId: string, sceneId: string) {
  const user = await requireUser();
  await markSceneAwaitingManualGeneration(user.id, projectId, sceneId);
  revalidatePath(`/projects/${projectId}/flow-package`);
  revalidatePath(`/projects/${projectId}/generate`);
}

export async function updateSceneFlowPromptAction(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get('projectId') ?? '');
  const sceneId = String(formData.get('sceneId') ?? '');
  const flowPrompt = String(formData.get('flowPrompt') ?? '');

  if (!projectId || !sceneId) {
    throw new Error('projectId and sceneId are required');
  }

  await updateSceneFlowPrompt(user.id, projectId, sceneId, flowPrompt);
  revalidatePath(`/projects/${projectId}/flow-package`);
  revalidatePath(`/projects/${projectId}/generate`);
  revalidatePath(`/projects/${projectId}/story`);
  revalidatePath(`/projects/${projectId}`);
}

export async function uploadManualSceneVideoAction(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get('projectId') ?? '');
  const sceneId = String(formData.get('sceneId') ?? '');
  const creditRaw = String(formData.get('confirmedCreditCost') ?? '').trim();
  const allowReplace = String(formData.get('allowReplace') ?? '') === 'true';
  const file = formData.get('video');

  if (!projectId || !sceneId) {
    throw new Error('projectId and sceneId are required');
  }
  if (!(file instanceof File)) {
    throw new Error('Video file is required');
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let confirmedCreditCost: number | 'unknown' | undefined;
  if (creditRaw.toLowerCase() === 'unknown') {
    confirmedCreditCost = 'unknown';
  } else if (creditRaw !== '') {
    const parsed = Number(creditRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('confirmedCreditCost must be a non-negative number or "unknown"');
    }
    confirmedCreditCost = parsed;
  }

  const result = await importManualSceneVideo({
    userId: user.id,
    projectId,
    sceneId,
    fileName: file.name,
    contentType: file.type || 'video/mp4',
    bytes,
    confirmedCreditCost,
    allowReplace,
  });

  revalidatePath(`/projects/${projectId}/flow-package`);
  revalidatePath(`/projects/${projectId}/generate`);
  revalidatePath(`/projects/${projectId}/assemble`);

  if (!result.ok) {
    throw new Error(result.reason);
  }

  return {
    storageKey: result.storageKey,
    sha256: result.sha256,
    durationSeconds: result.probe.durationSeconds,
  };
}
