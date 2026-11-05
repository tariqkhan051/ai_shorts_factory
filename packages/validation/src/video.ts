import { z } from 'zod';

/** Create a new video inside an existing project — idea-first, DNA supplies the rest. */
export const createVideoSchema = z.object({
  title: z.string().trim().max(200).optional(),
  concept: z.string().trim().min(1, 'Video concept is required').max(8000),
  story_brief: z.string().trim().max(20000).default(''),
  special_instructions: z.string().trim().max(8000).default(''),
  /** When true, refresh DNA from project's current version (only if not approved). */
  refresh_dna: z.boolean().optional(),
});

export const updateVideoSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  concept: z.string().trim().min(1).max(8000).optional(),
  story_brief: z.string().trim().max(20000).optional(),
  special_instructions: z.string().trim().max(8000).optional(),
  captions_on_video: z.boolean().optional(),
});

export type CreateVideoPayload = z.input<typeof createVideoSchema>;
export type UpdateVideoPayload = z.input<typeof updateVideoSchema>;

export function parseCreateVideo(input: unknown): CreateVideoPayload {
  return createVideoSchema.parse(input);
}

export function parseUpdateVideo(input: unknown): UpdateVideoPayload {
  return updateVideoSchema.parse(input);
}
