import { z } from 'zod';
import {
  GAME_SERVER_ENVIRONMENTS,
  MATCH_HUD_REGION_IDS,
} from '@ai-shorts-factory/shared-types';

/** Normalized crop rectangle (0–1 relative to frame width/height). */
export const hudRegionBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.01).max(1),
  h: z.number().min(0.01).max(1),
});

export const hudRegionSchema = z.object({
  id: z.enum(MATCH_HUD_REGION_IDS).or(z.string().trim().min(1).max(64)),
  label: z.string().trim().max(120).default(''),
  box: hudRegionBoxSchema,
});

export const hudRecognitionConfigSchema = z.object({
  hud_profile: z.string().trim().min(1).max(64).default('original_v1'),
  sample_timestamps_seconds: z.array(z.number().min(0).max(36000)).max(24).default([2, 5]),
  max_frames: z.number().int().min(1).max(24).default(3),
  regions: z.array(hudRegionSchema).min(1).max(20).default([
    {
      id: 'loading_roster',
      label: 'Loading / draft roster',
      box: { x: 0.05, y: 0.18, w: 0.9, h: 0.65 },
    },
  ]),
});

export const ingestMatchVideoSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    local_path: z.string().trim().min(1).max(1000),
    server_environment: z.enum(GAME_SERVER_ENVIRONMENTS),
    /** Required unless patch_unknown is true (Match Studio). */
    game_patch_id: z.string().uuid().nullable().optional(),
    patch_unknown: z.boolean().default(false),
    project_id: z.string().uuid().nullable().optional(),
    notes: z.string().trim().max(4000).default(''),
  })
  .superRefine((value, ctx) => {
    if (value.patch_unknown) return;
    if (!value.game_patch_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'game_patch_id is required unless patch_unknown is true',
        path: ['game_patch_id'],
      });
    }
  });

export const runMatchRosterAnalysisSchema = z.object({
  match_source_id: z.string().uuid(),
  /** Force recompute even when cache hit exists. */
  force: z.boolean().default(false),
});

export type HudRegionBox = z.infer<typeof hudRegionBoxSchema>;
export type HudRegion = z.infer<typeof hudRegionSchema>;
export type HudRecognitionConfig = z.infer<typeof hudRecognitionConfigSchema>;
export type IngestMatchVideoPayload = z.input<typeof ingestMatchVideoSchema>;
export type RunMatchRosterAnalysisPayload = z.input<typeof runMatchRosterAnalysisSchema>;

export function parseHudRecognitionConfig(input: unknown): HudRecognitionConfig {
  return hudRecognitionConfigSchema.parse(input);
}

export function emptyHudRecognitionConfig(
  partial?: Partial<HudRecognitionConfig>,
): HudRecognitionConfig {
  return hudRecognitionConfigSchema.parse(partial ?? {});
}

/** Default Original Server loading-screen OCR regions (MVP). */
export const DEFAULT_ORIGINAL_LOADING_HUD_CONFIG: HudRecognitionConfig =
  emptyHudRecognitionConfig({
    hud_profile: 'original_v1',
    sample_timestamps_seconds: [1, 2],
    max_frames: 2,
    regions: [
      {
        id: 'loading_roster',
        label: 'Loading roster panel',
        box: { x: 0.08, y: 0.2, w: 0.84, h: 0.6 },
      },
    ],
  });
