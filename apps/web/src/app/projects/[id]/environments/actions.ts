'use server';

import { revalidatePath } from 'next/cache';
import { createEnvironmentSchema } from '@ai-shorts-factory/validation';
import { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import {
  getEnvironmentRepository,
  persistMemoryStudioNow,
} from '@/lib/projects/repository';

export type EnvironmentActionState = {
  ok: boolean;
  message?: string;
  errors?: string[];
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createEnvironmentAction(
  projectId: string,
  _prev: EnvironmentActionState,
  formData: FormData,
): Promise<EnvironmentActionState> {
  try {
    const user = await requireUser();
    const payload = createEnvironmentSchema.parse({
      name: formString(formData, 'name'),
      kind: formString(formData, 'kind') || 'location',
      description: formString(formData, 'description'),
      visual_identity: formString(formData, 'visual_identity'),
      continuity_rules: formString(formData, 'continuity_rules'),
      reference_image_prompt: formString(formData, 'reference_image_prompt'),
    });
    const repo = await getEnvironmentRepository();
    await repo.create(user.id, projectId, payload);
    await persistMemoryStudioNow();
    revalidatePath(`/projects/${projectId}/environments`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, message: 'Environment added to project library' };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        message: 'Validation failed',
        errors: error.issues.map((i) => i.message),
      };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to create environment',
    };
  }
}

export async function archiveEnvironmentAction(
  projectId: string,
  environmentId: string,
): Promise<void> {
  const user = await requireUser();
  const repo = await getEnvironmentRepository();
  await repo.archive(user.id, environmentId);
  await persistMemoryStudioNow();
  revalidatePath(`/projects/${projectId}/environments`);
}
