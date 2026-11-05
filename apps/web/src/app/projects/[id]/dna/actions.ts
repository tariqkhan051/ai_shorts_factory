'use server';

import { revalidatePath } from 'next/cache';
import { dnaSnapshotFromProject } from '@ai-shorts-factory/database';
import { parseProjectDnaSnapshot } from '@ai-shorts-factory/validation';
import { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import {
  getProjectDnaRepository,
  getProjectRepository,
  persistMemoryStudioNow,
} from '@/lib/projects/repository';

export type DnaActionState = {
  ok: boolean;
  message?: string;
  errors?: string[];
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function formLines(formData: FormData, key: string): string[] {
  return formString(formData, key)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function publishProjectDnaAction(
  projectId: string,
  _prev: DnaActionState,
  formData: FormData,
): Promise<DnaActionState> {
  try {
    const user = await requireUser();
    const projects = await getProjectRepository();
    const project = await projects.getById(user.id, projectId);
    if (!project) return { ok: false, message: 'Project not found' };

    await projects.update(user.id, projectId, {
      name: formString(formData, 'name') || project.name,
      niche: formString(formData, 'content_niche'),
      content_purpose: formString(formData, 'content_purpose'),
      universe_context: formString(formData, 'universe_context'),
      target_audience: formString(formData, 'target_audience'),
      language: formString(formData, 'language') || project.language,
      category: (formString(formData, 'primary_content_category') ||
        project.category) as typeof project.category,
      visual_style: (formString(formData, 'default_visual_style') ||
        project.visual_style) as typeof project.visual_style,
      notes: formString(formData, 'description'),
      captions_on_video: formData.get('captions_on_video') === 'true',
    });

    const refreshed = (await projects.getById(user.id, projectId))!;
    const base = dnaSnapshotFromProject(refreshed);
    const snapshot = parseProjectDnaSnapshot({
      ...base,
      identity: {
        ...base.identity,
        name: formString(formData, 'name') || refreshed.name,
        description: formString(formData, 'description'),
        content_niche: formString(formData, 'content_niche'),
        content_purpose: formString(formData, 'content_purpose'),
        universe_context: formString(formData, 'universe_context'),
        target_audience: formString(formData, 'target_audience'),
        language: formString(formData, 'language') || refreshed.language,
        primary_content_category: refreshed.category,
        brand_id: refreshed.brand_id,
      },
      visual: {
        ...base.visual,
        default_visual_style: refreshed.visual_style,
        lighting_direction: formString(formData, 'lighting_direction'),
        camera_language: formString(formData, 'camera_language'),
        character_rendering_style: formString(formData, 'character_rendering_style'),
        environment_style: formString(formData, 'environment_style'),
        visual_continuity_rules: formString(formData, 'visual_continuity_rules'),
        color_palette: formLines(formData, 'color_palette'),
      },
      storytelling: {
        ...base.storytelling,
        tone: formString(formData, 'tone'),
        pacing: formString(formData, 'pacing'),
        ending_style: formString(formData, 'ending_style'),
        dialogue_conventions: formString(formData, 'dialogue_conventions'),
        content_restrictions: formString(formData, 'content_restrictions'),
        default_narrative_structure: formString(formData, 'default_narrative_structure'),
        preferred_hooks: formLines(formData, 'preferred_hooks'),
      },
      production_defaults: {
        ...base.production_defaults,
        aspect_ratio: formString(formData, 'aspect_ratio') || '9:16',
        target_duration_seconds: Number(formString(formData, 'target_duration_seconds') || 40),
        captions_on_video: formData.get('captions_on_video') === 'true',
        audio_direction: formString(formData, 'audio_direction'),
        subtitle_caption_style: formString(formData, 'subtitle_caption_style'),
      },
      prompt_instructions: {
        permanent_project_instructions: formString(formData, 'permanent_project_instructions'),
        screenplay_generation_instructions: formString(
          formData,
          'screenplay_generation_instructions',
        ),
        scene_prompt_instructions: formString(formData, 'scene_prompt_instructions'),
        character_continuity_instructions: formString(
          formData,
          'character_continuity_instructions',
        ),
        negative_prompt_rules: formString(formData, 'negative_prompt_rules'),
      },
    });

    const dna = await getProjectDnaRepository();
    const current = await dna.getCurrent(user.id, projectId);
    const note = formString(formData, 'version_note') || 'DNA update';
    if (!current) {
      await dna.seedInitial(user.id, projectId, snapshot);
    } else {
      await dna.publishVersion(user.id, projectId, snapshot, note);
    }

    await persistMemoryStudioNow();
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/dna`);
    return { ok: true, message: 'Project DNA version published. Existing videos keep their snapshot.' };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        message: 'Validation failed',
        errors: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to publish DNA',
    };
  }
}
