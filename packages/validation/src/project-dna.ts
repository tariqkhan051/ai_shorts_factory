import { z } from 'zod';
import { CONTENT_CATEGORIES, VISUAL_STYLES } from '@ai-shorts-factory/shared-types';

/** Immutable Project DNA snapshot sections (versioned separately). */
export const projectDnaIdentitySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4000).default(''),
  brand_id: z.string().uuid().nullable().default(null),
  content_niche: z.string().trim().max(240).default(''),
  target_audience: z.string().trim().max(240).default(''),
  language: z.string().trim().min(2).max(32).default('en'),
  primary_content_category: z.enum(CONTENT_CATEGORIES).default('other'),
  content_purpose: z.string().trim().max(1000).default(''),
  universe_context: z.string().trim().max(20000).default(''),
});

export const projectDnaVisualSchema = z.object({
  default_visual_style: z.enum(VISUAL_STYLES).default('automatic'),
  style_preferences: z.array(z.string().trim().max(80)).max(20).default([]),
  color_palette: z.array(z.string().trim().max(64)).max(24).default([]),
  lighting_direction: z.string().trim().max(1000).default(''),
  camera_language: z.string().trim().max(1000).default(''),
  character_rendering_style: z.string().trim().max(1000).default(''),
  environment_style: z.string().trim().max(1000).default(''),
  logo_asset_id: z.string().uuid().nullable().default(null),
  watermark_asset_id: z.string().uuid().nullable().default(null),
  visual_continuity_rules: z.string().trim().max(8000).default(''),
});

export const projectDnaStorytellingSchema = z.object({
  default_narrative_structure: z.string().trim().max(2000).default(''),
  preferred_hooks: z.array(z.string().trim().max(500)).max(20).default([]),
  tone: z.string().trim().max(1000).default(''),
  pacing: z.string().trim().max(1000).default(''),
  ending_style: z.string().trim().max(1000).default(''),
  dialogue_conventions: z.string().trim().max(2000).default(''),
  content_restrictions: z.string().trim().max(4000).default(''),
  storytelling_examples: z.array(z.string().trim().max(2000)).max(20).default([]),
  reference_video_notes: z.string().trim().max(4000).default(''),
});

export const projectDnaProductionDefaultsSchema = z.object({
  aspect_ratio: z.string().trim().max(16).default('9:16'),
  target_duration_seconds: z.number().positive().max(59).default(40),
  scene_count: z.number().int().min(1).max(5).default(5),
  default_scene_duration_seconds: z.number().positive().max(30).default(8),
  target_resolution: z.string().trim().max(16).default('720p'),
  fps: z.number().int().min(12).max(60).default(30),
  subtitle_caption_style: z.string().trim().max(1000).default(''),
  audio_direction: z.string().trim().max(2000).default(''),
  captions_on_video: z.boolean().default(false),
  default_generation_settings: z.record(z.string(), z.unknown()).default({}),
});

export const projectDnaPromptInstructionsSchema = z.object({
  permanent_project_instructions: z.string().trim().max(8000).default(''),
  screenplay_generation_instructions: z.string().trim().max(8000).default(''),
  scene_prompt_instructions: z.string().trim().max(8000).default(''),
  character_continuity_instructions: z.string().trim().max(8000).default(''),
  negative_prompt_rules: z.string().trim().max(4000).default(''),
});

export const projectDnaSnapshotSchema = z.object({
  identity: projectDnaIdentitySchema,
  visual: projectDnaVisualSchema.default({}),
  storytelling: projectDnaStorytellingSchema.default({}),
  production_defaults: projectDnaProductionDefaultsSchema.default({}),
  prompt_instructions: projectDnaPromptInstructionsSchema.default({}),
});

export type ProjectDnaSnapshot = z.infer<typeof projectDnaSnapshotSchema>;
export type ProjectDnaIdentity = z.infer<typeof projectDnaIdentitySchema>;
export type ProjectDnaVisual = z.infer<typeof projectDnaVisualSchema>;
export type ProjectDnaStorytelling = z.infer<typeof projectDnaStorytellingSchema>;
export type ProjectDnaProductionDefaults = z.infer<typeof projectDnaProductionDefaultsSchema>;
export type ProjectDnaPromptInstructions = z.infer<typeof projectDnaPromptInstructionsSchema>;

export function parseProjectDnaSnapshot(input: unknown): ProjectDnaSnapshot {
  return projectDnaSnapshotSchema.parse(input);
}

export function emptyProjectDnaSnapshot(
  partial?: Partial<{
    identity: Partial<ProjectDnaIdentity>;
    visual: Partial<ProjectDnaVisual>;
    storytelling: Partial<ProjectDnaStorytelling>;
    production_defaults: Partial<ProjectDnaProductionDefaults>;
    prompt_instructions: Partial<ProjectDnaPromptInstructions>;
  }>,
): ProjectDnaSnapshot {
  return projectDnaSnapshotSchema.parse({
    identity: partial?.identity ?? {},
    visual: partial?.visual ?? {},
    storytelling: partial?.storytelling ?? {},
    production_defaults: partial?.production_defaults ?? {},
    prompt_instructions: partial?.prompt_instructions ?? {},
  });
}
