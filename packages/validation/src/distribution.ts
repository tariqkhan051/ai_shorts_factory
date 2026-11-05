import { z } from 'zod';
import { DISTRIBUTION_STATUSES, SOCIAL_PLATFORMS } from '@ai-shorts-factory/shared-types';

export const createDistributionSchema = z.object({
  social_account_id: z.string().uuid(),
  platform: z.enum(SOCIAL_PLATFORMS).optional(),
  target_format: z.string().trim().max(64).default('9:16'),
  caption: z.string().trim().max(4000).default(''),
  hashtags: z.array(z.string().trim().max(80)).max(40).default([]),
  thumbnail_asset_id: z.string().uuid().nullable().optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
});

export const updateDistributionSchema = z.object({
  target_format: z.string().trim().max(64).optional(),
  caption: z.string().trim().max(4000).optional(),
  hashtags: z.array(z.string().trim().max(80)).max(40).optional(),
  thumbnail_asset_id: z.string().uuid().nullable().optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
  status: z.enum(DISTRIBUTION_STATUSES).optional(),
  published_url: z.string().url().nullable().optional(),
  platform_reference_id: z.string().trim().max(240).nullable().optional(),
  failure_reason: z.string().trim().max(2000).nullable().optional(),
  /** Manual confirmation that the operator published outside the app. */
  confirm_manual_publish: z.boolean().optional(),
});

export type CreateDistributionPayload = z.input<typeof createDistributionSchema>;
export type UpdateDistributionPayload = z.input<typeof updateDistributionSchema>;

export function parseCreateDistribution(input: unknown): CreateDistributionPayload {
  return createDistributionSchema.parse(input);
}

export function parseUpdateDistribution(input: unknown): UpdateDistributionPayload {
  return updateDistributionSchema.parse(input);
}
