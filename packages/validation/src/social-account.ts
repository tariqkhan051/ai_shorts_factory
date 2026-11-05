import { z } from 'zod';
import { SOCIAL_PLATFORMS } from '@ai-shorts-factory/shared-types';

export const createSocialAccountSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  display_name: z.string().trim().min(1).max(120),
  handle: z.string().trim().min(1).max(120),
  brand_id: z.string().uuid().nullable().optional(),
  default_caption_rules: z.string().trim().max(4000).default(''),
  default_hashtag_rules: z.string().trim().max(2000).default(''),
  default_content_format: z.string().trim().max(64).default('9:16'),
  account_preferences: z.record(z.string(), z.unknown()).default({}),
});

export const updateSocialAccountSchema = createSocialAccountSchema.partial().omit({
  platform: true,
});

export const linkProjectSocialAccountSchema = z.object({
  social_account_id: z.string().uuid(),
  is_default: z.boolean().default(false),
});

export type CreateSocialAccountPayload = z.input<typeof createSocialAccountSchema>;
export type UpdateSocialAccountPayload = z.input<typeof updateSocialAccountSchema>;
export type LinkProjectSocialAccountPayload = z.input<typeof linkProjectSocialAccountSchema>;

export function parseCreateSocialAccount(input: unknown): CreateSocialAccountPayload {
  return createSocialAccountSchema.parse(input);
}

export function parseUpdateSocialAccount(input: unknown): UpdateSocialAccountPayload {
  return updateSocialAccountSchema.parse(input);
}
