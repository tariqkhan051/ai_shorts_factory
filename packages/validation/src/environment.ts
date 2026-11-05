import { z } from 'zod';
import { ENVIRONMENT_KINDS } from '@ai-shorts-factory/shared-types';

export const createEnvironmentSchema = z.object({
  name: z.string().trim().min(1).max(160),
  kind: z.enum(ENVIRONMENT_KINDS).default('location'),
  description: z.string().trim().max(8000).default(''),
  visual_identity: z.string().trim().max(8000).default(''),
  continuity_rules: z.string().trim().max(4000).default(''),
  reference_image_prompt: z.string().trim().max(4000).default(''),
});

export const updateEnvironmentSchema = createEnvironmentSchema.partial().extend({
  active: z.boolean().optional(),
});

export type CreateEnvironmentPayload = z.input<typeof createEnvironmentSchema>;
export type UpdateEnvironmentPayload = z.input<typeof updateEnvironmentSchema>;

export function parseCreateEnvironment(input: unknown): CreateEnvironmentPayload {
  return createEnvironmentSchema.parse(input);
}

export function parseUpdateEnvironment(input: unknown): UpdateEnvironmentPayload {
  return updateEnvironmentSchema.parse(input);
}
