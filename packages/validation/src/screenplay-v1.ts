import { z } from 'zod';
import {
  BUSINESS_DEFAULTS,
  CONTENT_CATEGORIES,
  VISUAL_STYLES,
} from '@ai-shorts-factory/shared-types';

/**
 * Versioned screenplay schema (v1).
 * Full ChatGPT import UX lands in Phase 2; schema contract is defined here.
 */
export const SCREENPLAY_SCHEMA_VERSION = '1.0.0' as const;

export const characterSchemaV1 = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  visual_identity: z.string().min(1),
  clothing: z.string().optional(),
  appearance_details: z.string().optional(),
});

export const sceneSchemaV1 = z.object({
  scene_number: z.number().int().min(1).max(BUSINESS_DEFAULTS.sceneCount),
  title: z.string().min(1),
  duration_seconds: z.number().positive().max(BUSINESS_DEFAULTS.finalVideoMaxSeconds),
  visual_description: z.string().min(1),
  flow_prompt: z.string().min(1),
  narration: z.string().default(''),
  dialogue: z.string().default(''),
  text_overlay: z.string().default(''),
  transition_out: z.string().default('cut'),
});

export const publishingMetadataSchemaV1 = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

export const screenplaySchemaV1 = z
  .object({
    schema_version: z.literal(SCREENPLAY_SCHEMA_VERSION).default(SCREENPLAY_SCHEMA_VERSION),
    title: z.string().min(1),
    category: z.enum(CONTENT_CATEGORIES),
    visual_style: z.enum(VISUAL_STYLES),
    story_summary: z.string().min(1),
    hook: z.string().min(1),
    characters: z.array(characterSchemaV1).min(1),
    scenes: z.array(sceneSchemaV1).length(BUSINESS_DEFAULTS.sceneCount),
    ending: z.string().min(1),
    publishing_metadata: publishingMetadataSchemaV1,
  })
  .superRefine((value, ctx) => {
    const numbers = value.scenes.map((s) => s.scene_number).sort((a, b) => a - b);
    for (let i = 0; i < BUSINESS_DEFAULTS.sceneCount; i += 1) {
      if (numbers[i] !== i + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes'],
          message: `Scenes must be numbered 1–${BUSINESS_DEFAULTS.sceneCount} without gaps or duplicates.`,
        });
        break;
      }
    }

    const totalDuration = value.scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0);
    if (totalDuration > BUSINESS_DEFAULTS.finalVideoMaxSeconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scenes'],
        message: `Total scene duration (${totalDuration}s) exceeds maximum final video duration (${BUSINESS_DEFAULTS.finalVideoMaxSeconds}s).`,
      });
    }
  });

export type ScreenplayV1 = z.infer<typeof screenplaySchemaV1>;
export type SceneV1 = z.infer<typeof sceneSchemaV1>;

export function parseScreenplayV1(input: unknown): ScreenplayV1 {
  return screenplaySchemaV1.parse(input);
}

export function safeParseScreenplayV1(input: unknown) {
  return screenplaySchemaV1.safeParse(input);
}

export function formatScreenplayErrors(result: ReturnType<typeof safeParseScreenplayV1>): string[] {
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'screenplay';
    return `${path}: ${issue.message}`;
  });
}
