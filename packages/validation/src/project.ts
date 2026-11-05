import { z } from 'zod';
import { CONTENT_CATEGORIES, VISUAL_STYLES } from '@ai-shorts-factory/shared-types';

export const projectInputSchema = z.object({
  idea: z.string().trim().min(1, 'Idea is required').max(8000),
  existing_story: z.string().trim().max(20000).default(''),
  additional_instructions: z.string().trim().max(8000).default(''),
  character_reference_notes: z.string().trim().max(8000).default(''),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(120),
  category: z.enum(CONTENT_CATEGORIES),
  visual_style: z.enum(VISUAL_STYLES).default('automatic'),
  language: z.string().trim().min(2).max(32).default('en'),
  target_audience: z.string().trim().max(240).default(''),
  notes: z.string().trim().max(4000).default(''),
  /** When true, ChatGPT must supply per-scene captions and assembly burns them in. */
  captions_on_video: z.boolean().default(false),
  /** Optional Brand association; a default Personal brand is used when omitted. */
  brand_id: z.string().uuid().optional(),
  niche: z.string().trim().max(240).default(''),
  content_purpose: z.string().trim().max(1000).default(''),
  universe_context: z.string().trim().max(20000).default(''),
  /**
   * Creative brief for the first video (legacy-compatible).
   * When provided, creates Project + Video #1. Omit for DNA-only project creation.
   */
  input: projectInputSchema.optional(),
  /** Explicit first-video concept when not using legacy `input`. */
  initial_video_concept: z.string().trim().max(8000).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  category: z.enum(CONTENT_CATEGORIES).optional(),
  visual_style: z.enum(VISUAL_STYLES).optional(),
  language: z.string().trim().min(2).max(32).optional(),
  target_audience: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(4000).optional(),
  captions_on_video: z.boolean().optional(),
  brand_id: z.string().uuid().nullable().optional(),
  niche: z.string().trim().max(240).optional(),
  content_purpose: z.string().trim().max(1000).optional(),
  universe_context: z.string().trim().max(20000).optional(),
  input: projectInputSchema.partial().optional(),
});

export type ProjectInputPayload = z.infer<typeof projectInputSchema>;
export type CreateProjectPayload = z.input<typeof createProjectSchema>;
export type UpdateProjectPayload = z.input<typeof updateProjectSchema>;

export function parseCreateProject(input: unknown): CreateProjectPayload {
  return createProjectSchema.parse(input);
}

export function parseUpdateProject(input: unknown): UpdateProjectPayload {
  return updateProjectSchema.parse(input);
}

export function formatProjectErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'project';
    return `${path}: ${issue.message}`;
  });
}
