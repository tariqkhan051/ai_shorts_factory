import { z } from 'zod';
import {
  GAME_SERVER_ENVIRONMENTS,
  MATCH_COMMENTARY_STYLES,
  MATCH_CAPABILITY_STATUSES,
  MATCH_STUDIO_PATCH_RESOLUTIONS,
  MATCH_STUDIO_STATUSES,
} from '@ai-shorts-factory/shared-types';

export const MATCH_STUDIO_SCHEMA_VERSION = 'match-studio-v1' as const;

export const matchStudioStatusSchema = z.enum(MATCH_STUDIO_STATUSES);
export const matchStudioPatchResolutionSchema = z.enum(MATCH_STUDIO_PATCH_RESOLUTIONS);
export const matchCommentaryStyleSchema = z.enum(MATCH_COMMENTARY_STYLES);
export const matchCapabilityStatusSchema = z.enum(MATCH_CAPABILITY_STATUSES);

export const matchStudioCapabilityFlagsSchema = z.object({
  roster_ocr: matchCapabilityStatusSchema.default('partial'),
  timeline: matchCapabilityStatusSchema.default('partial'),
  audio_events: matchCapabilityStatusSchema.default('stub'),
  scoreboard: matchCapabilityStatusSchema.default('not_implemented'),
  minimap: matchCapabilityStatusSchema.default('not_implemented'),
  commentary: matchCapabilityStatusSchema.default('partial'),
  tts: matchCapabilityStatusSchema.default('unavailable'),
  full_match_render: matchCapabilityStatusSchema.default('partial'),
  shorts: matchCapabilityStatusSchema.default('partial'),
});

export const createMatchStudioRunSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    server_environment: z.enum(GAME_SERVER_ENVIRONMENTS),
    game_profile_id: z.string().uuid(),
    /** Omit or null with patch_unknown=true for explicit unknown patch. */
    game_patch_id: z.string().uuid().nullable().optional(),
    patch_unknown: z.boolean().default(false),
    notes: z.string().trim().max(4000).default(''),
  })
  .superRefine((value, ctx) => {
    if (value.patch_unknown) {
      if (value.game_patch_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'game_patch_id must be empty when patch_unknown is true',
          path: ['game_patch_id'],
        });
      }
      return;
    }
    if (!value.game_patch_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'game_patch_id is required unless patch_unknown is true',
        path: ['game_patch_id'],
      });
    }
  });

export const transitionMatchStudioStatusSchema = z.object({
  from: matchStudioStatusSchema,
  to: matchStudioStatusSchema,
});

/** Legal Match Studio status transitions. */
export const MATCH_STUDIO_ALLOWED_TRANSITIONS: Partial<
  Record<(typeof MATCH_STUDIO_STATUSES)[number], readonly (typeof MATCH_STUDIO_STATUSES)[number][]>
> = {
  draft: ['awaiting_upload', 'cancelled'],
  awaiting_upload: ['ingesting', 'cancelled'],
  ingesting: ['ready_for_analysis', 'failed', 'cancelled'],
  ready_for_analysis: ['analyzing', 'cancelled'],
  analyzing: ['awaiting_timeline_review', 'failed', 'cancelled'],
  awaiting_timeline_review: ['commentary_pending', 'analyzing', 'cancelled'],
  commentary_pending: ['awaiting_commentary_review', 'failed', 'cancelled'],
  awaiting_commentary_review: ['voice_pending', 'edl_pending', 'commentary_pending', 'cancelled'],
  voice_pending: ['awaiting_voice_approval', 'edl_pending', 'failed', 'cancelled'],
  awaiting_voice_approval: ['edl_pending', 'voice_pending', 'cancelled'],
  edl_pending: ['awaiting_edit_review', 'failed', 'cancelled'],
  awaiting_edit_review: ['rendering', 'edl_pending', 'cancelled'],
  rendering: ['awaiting_final_approval', 'failed', 'cancelled'],
  awaiting_final_approval: ['completed', 'rendering', 'cancelled'],
  failed: ['ready_for_analysis', 'analyzing', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransitionMatchStudioStatus(
  from: (typeof MATCH_STUDIO_STATUSES)[number],
  to: (typeof MATCH_STUDIO_STATUSES)[number],
): boolean {
  if (from === to) return true;
  return MATCH_STUDIO_ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertMatchStudioTransition(
  from: (typeof MATCH_STUDIO_STATUSES)[number],
  to: (typeof MATCH_STUDIO_STATUSES)[number],
): void {
  if (!canTransitionMatchStudioStatus(from, to)) {
    throw new Error(`Illegal Match Studio transition: ${from} -> ${to}`);
  }
}

export const matchStudioRunSchema = z.object({
  schema_version: z.literal(MATCH_STUDIO_SCHEMA_VERSION).default(MATCH_STUDIO_SCHEMA_VERSION),
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  match_source_id: z.string().uuid().nullable(),
  status: matchStudioStatusSchema,
  patch_resolution: matchStudioPatchResolutionSchema,
  server_environment: z.enum(GAME_SERVER_ENVIRONMENTS),
  game_profile_id: z.string().uuid(),
  game_patch_id: z.string().uuid().nullable(),
  title: z.string(),
  last_error: z.string().nullable().default(null),
  capability_flags: matchStudioCapabilityFlagsSchema.default({}),
  commentary_style: matchCommentaryStyleSchema.default('esports_caster'),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type CreateMatchStudioRunPayload = z.input<typeof createMatchStudioRunSchema>;
export type MatchStudioCapabilityFlags = z.infer<typeof matchStudioCapabilityFlagsSchema>;
export type MatchStudioRun = z.infer<typeof matchStudioRunSchema>;

export function parseCreateMatchStudioRun(input: unknown): CreateMatchStudioRunPayload {
  return createMatchStudioRunSchema.parse(input);
}

export function emptyMatchStudioCapabilityFlags(
  overrides: Partial<MatchStudioCapabilityFlags> = {},
): MatchStudioCapabilityFlags {
  return matchStudioCapabilityFlagsSchema.parse(overrides);
}
