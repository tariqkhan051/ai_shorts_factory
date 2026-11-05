'use server';

import { revalidatePath } from 'next/cache';
import {
  createSampleScreenplay,
  importScreenplayFromText,
} from '@ai-shorts-factory/chatgpt-import';
import { syncCharactersFromScreenplay } from '@ai-shorts-factory/database';
import { parseScreenplayV1 } from '@ai-shorts-factory/validation';
import { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import {
  getCharacterRepository,
  getProjectRepository,
  getStoryRepository,
  persistMemoryStudioNow,
} from '@/lib/projects/repository';

export type StoryActionState = {
  ok: boolean;
  message?: string;
  errors?: string[];
  warnings?: string[];
  nextHref?: string;
  conflictCount?: number;
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function revalidateStory(projectId: string) {
  await persistMemoryStudioNow();
  revalidatePath('/');
  revalidatePath('/projects');
  revalidatePath('/characters');
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/story`);
  revalidatePath(`/projects/${projectId}/characters`);
  revalidatePath(`/projects/${projectId}/flow-package`);
}

export async function markPromptReadyAction(projectId: string): Promise<void> {
  const user = await requireUser();
  const stories = await getStoryRepository();
  await stories.markPromptReady(user.id, projectId);
  await revalidateStory(projectId);
}

export async function markWaitingForChatGptAction(projectId: string): Promise<void> {
  const user = await requireUser();
  const stories = await getStoryRepository();
  await stories.markWaitingForChatGpt(user.id, projectId);
  await revalidateStory(projectId);
}

export async function importScreenplayAction(
  projectId: string,
  _prev: StoryActionState,
  formData: FormData,
): Promise<StoryActionState> {
  try {
    const user = await requireUser();
    const raw = formString(formData, 'json');
    const imported = importScreenplayFromText(raw);
    if (!imported.ok) {
      // Do not touch previously saved story versions.
      return {
        ok: false,
        message: 'Import rejected — previous screenplay unchanged',
        errors: imported.errors,
      };
    }

    const stories = await getStoryRepository();
    await stories.importScreenplay(user.id, projectId, imported.screenplay);
    const characters = await getCharacterRepository();
    const sync = await syncCharactersFromScreenplay(
      characters,
      user.id,
      projectId,
      imported.screenplay,
    );
    await revalidateStory(projectId);
    const warnings = [...(imported.warnings ?? [])];
    if (sync.conflicts.length > 0) {
      warnings.push(
        `${sync.conflicts.length} library name conflict(s) — resolve reuse vs create on Character Review.`,
      );
    }
    if (sync.missingReferences.length > 0) {
      warnings.push(
        `${sync.missingReferences.length} character(s) still need primary reference images.`,
      );
    }
    return {
      ok: true,
      message: 'Screenplay imported — review characters next',
      warnings,
      nextHref: `/projects/${projectId}/characters`,
      conflictCount: sync.conflicts.length,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Import failed',
    };
  }
}

export async function loadSampleScreenplayAction(projectId: string): Promise<void> {
  const user = await requireUser();
  const projects = await getProjectRepository();
  const project = await projects.getById(user.id, projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const sample = createSampleScreenplay({
    category: project.category,
    visual_style: project.visual_style,
    title: project.name,
  });
  const stories = await getStoryRepository();
  await stories.importScreenplay(user.id, projectId, sample);
  const characters = await getCharacterRepository();
  await syncCharactersFromScreenplay(characters, user.id, projectId, sample);
  await revalidateStory(projectId);
}

export async function saveScreenplayEditsAction(
  projectId: string,
  _prev: StoryActionState,
  formData: FormData,
): Promise<StoryActionState> {
  try {
    const user = await requireUser();
    const raw = formString(formData, 'screenplay_json');
    const parsedJson = JSON.parse(raw) as unknown;
    const screenplay = parseScreenplayV1(parsedJson);
    const stories = await getStoryRepository();
    await stories.saveEditedScreenplay(user.id, projectId, screenplay);
    await revalidateStory(projectId);
    return { ok: true, message: 'Screenplay saved' };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        message: 'Validation failed — previous approved/imported work kept until a valid save',
        errors: error.issues.map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join('.') : 'screenplay';
          return `${path}: ${issue.message}`;
        }),
      };
    }
    if (error instanceof SyntaxError) {
      return { ok: false, message: 'Screenplay JSON is invalid' };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to save screenplay',
    };
  }
}

export async function approveStoryAction(projectId: string): Promise<void> {
  const user = await requireUser();
  const stories = await getStoryRepository();
  await stories.approveStory(user.id, projectId);

  // Orchestration signal: story/video approved for production. Does not drive Flow.
  try {
    const { emitProjectEvent, resolveVideoIdForProject } = await import('@/lib/n8n/emit');
    const { getOrchestrationController } = await import('@/lib/n8n/runtime');
    const videoId = await resolveVideoIdForProject(user.id, projectId);
    const controller = getOrchestrationController();
    const orch = await controller.getOrCreate(projectId, videoId);
    if (orch.enabled) {
      await controller.apply(projectId, videoId, 'start');
    }
    await emitProjectEvent({
      userId: user.id,
      projectId,
      videoId,
      eventType: 'video.approved',
      idempotencyParts: [projectId, videoId, 'approved'],
      status: {
        workflow_state: 'SCENE_PREPARATION',
        orchestration_enabled: orch.enabled,
        flow_package_path: `/projects/${projectId}/flow-package`,
      },
    });
  } catch {
    // n8n must never block story approval
  }

  await revalidateStory(projectId);
}

export async function createCharacterAction(
  projectId: string,
  _prev: StoryActionState,
  formData: FormData,
): Promise<StoryActionState> {
  try {
    const user = await requireUser();
    const characters = await getCharacterRepository();
    const character = await characters.create(user.id, {
      name: formString(formData, 'name'),
      description: formString(formData, 'description'),
      visual_identity: formString(formData, 'visual_identity'),
      clothing: formString(formData, 'clothing'),
      appearance_details: formString(formData, 'appearance_details'),
      in_library: false,
    });
    await characters.linkToProject(user.id, projectId, character.id);
    await revalidateStory(projectId);
    return { ok: true, message: 'Character created and linked' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to create character',
    };
  }
}

export async function deleteCharacterAction(projectId: string, characterId: string): Promise<void> {
  const user = await requireUser();
  const characters = await getCharacterRepository();
  await characters.unlinkFromProject(user.id, projectId, characterId);
  const character = await characters.getById(user.id, characterId);
  if (character && !character.in_library) {
    await characters.delete(user.id, characterId);
  }
  await revalidateStory(projectId);
}
