'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createVideoInProject,
  videoContextFromDna,
} from '@ai-shorts-factory/database';
import { createVideoSchema, formatProjectErrors } from '@ai-shorts-factory/validation';
import { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import {
  getContentPlatformDeps,
  getProjectDnaRepository,
  getVideoRepository,
  persistMemoryStudioNow,
} from '@/lib/projects/repository';

export type VideoActionState = {
  ok: boolean;
  message?: string;
  errors?: string[];
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createVideoAction(
  projectId: string,
  _prev: VideoActionState,
  formData: FormData,
): Promise<VideoActionState> {
  try {
    const user = await requireUser();
    const payload = createVideoSchema.parse({
      title: formString(formData, 'title') || undefined,
      concept: formString(formData, 'concept'),
      story_brief: formString(formData, 'story_brief'),
      special_instructions: formString(formData, 'special_instructions'),
    });

    const deps = await getContentPlatformDeps();
    const video = await createVideoInProject(deps, user.id, projectId, payload);
    await persistMemoryStudioNow();

    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/videos`);
    redirect(`/projects/${projectId}/videos/${video.id}`);
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, errors: formatProjectErrors(error), message: 'Validation failed' };
    }
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to create video',
    };
  }
}

export async function refreshVideoDnaAction(projectId: string, videoId: string): Promise<void> {
  const user = await requireUser();
  const dna = await getProjectDnaRepository();
  const videos = await getVideoRepository();
  const current = await dna.getCurrent(user.id, projectId);
  if (!current) {
    throw new Error('Project DNA missing');
  }

  await videos.refreshInheritedDna(user.id, videoId, {
    project_dna_version: current.version,
    context_snapshot: videoContextFromDna(projectId, current.version, current.snapshot),
  });
  await persistMemoryStudioNow();
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/videos/${videoId}`);
}
