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
  input: projectInputSchema,
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  category: z.enum(CONTENT_CATEGORIES).optional(),
  visual_style: z.enum(VISUAL_STYLES).optional(),
  language: z.string().trim().min(2).max(32).optional(),
  target_audience: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(4000).optional(),
  input: projectInputSchema.partial().optional(),
});

export type ProjectInputPayload = z.infer<typeof projectInputSchema>;
export type CreateProjectPayload = z.infer<typeof createProjectSchema>;
export type UpdateProjectPayload = z.infer<typeof updateProjectSchema>;

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
