'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createProjectSchema,
  formatProjectErrors,
  updateProjectSchema,
} from '@ai-shorts-factory/validation';
import { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import { getProjectRepository } from '@/lib/projects/repository';

export type ActionState = {
  ok: boolean;
  message?: string;
  errors?: string[];
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const payload = createProjectSchema.parse({
      name: formString(formData, 'name'),
      category: formString(formData, 'category'),
      visual_style: formString(formData, 'visual_style') || 'automatic',
      language: formString(formData, 'language') || 'en',
      target_audience: formString(formData, 'target_audience'),
      notes: formString(formData, 'notes'),
      input: {
        idea: formString(formData, 'idea'),
        existing_story: formString(formData, 'existing_story'),
        additional_instructions: formString(formData, 'additional_instructions'),
        character_reference_notes: formString(formData, 'character_reference_notes'),
      },
    });

    const repo = await getProjectRepository();
    const project = await repo.create(user.id, payload);

    revalidatePath('/');
    revalidatePath('/projects');
    redirect(`/projects/${project.id}`);
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, errors: formatProjectErrors(error), message: 'Validation failed' };
    }
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to create project',
    };
  }
}

export async function updateProjectAction(
  projectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const payload = updateProjectSchema.parse({
      name: formString(formData, 'name') || undefined,
      category: formString(formData, 'category') || undefined,
      visual_style: formString(formData, 'visual_style') || undefined,
      language: formString(formData, 'language') || undefined,
      target_audience: formString(formData, 'target_audience'),
      notes: formString(formData, 'notes'),
      input: {
        idea: formString(formData, 'idea'),
        existing_story: formString(formData, 'existing_story'),
        additional_instructions: formString(formData, 'additional_instructions'),
        character_reference_notes: formString(formData, 'character_reference_notes'),
      },
    });

    const repo = await getProjectRepository();
    await repo.update(user.id, projectId, payload);

    revalidatePath('/');
    revalidatePath('/projects');
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, message: 'Project updated' };
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, errors: formatProjectErrors(error), message: 'Validation failed' };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to update project',
    };
  }
}

export async function deleteProjectAction(projectId: string): Promise<void> {
  const user = await requireUser();
  const repo = await getProjectRepository();
  await repo.softDelete(user.id, projectId);
  revalidatePath('/');
  revalidatePath('/projects');
  redirect('/projects');
}
