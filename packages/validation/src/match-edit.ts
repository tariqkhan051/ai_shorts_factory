import { z } from 'zod';
import {
  GAME_SERVER_ENVIRONMENTS,
  MATCH_EDIT_STATUSES,
  MATCH_EVENT_TYPES,
} from '@ai-shorts-factory/shared-types';

export const MATCH_EDIT_PLAN_SCHEMA_VERSION = 'match-edit-plan-v1' as const;
export const MATCH_EDIT_EXPORT_SCHEMA_VERSION = 'match-edit-export-v1' as const;

export const matchEditSegmentKindSchema = z.enum(['highlight', 'boring']);

/** One contiguous cut from the source VOD (source timeline seconds). */
export const matchEditSegmentSchema = z.object({
  id: z.string().uuid(),
  kind: matchEditSegmentKindSchema,
  /** Highlight segments cite the primary event driving the cut. */
  event_id: z.string().uuid().nullable().default(null),
  event_type: z.enum(MATCH_EVENT_TYPES).nullable().default(null),
  source_start_seconds: z.number().min(0),
  source_end_seconds: z.number().min(0),
  /** Playback speed relative to source (1 = realtime; >1 speeds boring gaps). */
  speed: z.number().min(0.25).max(16).default(1),
});

export const matchEditShortCandidateSchema = z.object({
  id: z.string().uuid(),
  rank: z.number().int().min(1).max(2),
  event_id: z.string().uuid(),
  event_type: z.enum(MATCH_EVENT_TYPES),
  confidence: z.number().min(0).max(1),
  source_start_seconds: z.number().min(0),
  source_end_seconds: z.number().min(0),
  /** Expected output duration at speed 1 (may be trimmed to short_max). */
  duration_seconds: z.number().min(0),
  caption_event_ids: z.array(z.string().uuid()).max(20).default([]),
});

export const matchEditPlanConfigSchema = z.object({
  pre_pad_seconds: z.number().min(0).max(60).default(3),
  post_pad_seconds: z.number().min(0).max(60).default(3),
  boring_speed: z.number().min(1).max(16).default(4),
  min_gap_for_boring_seconds: z.number().min(0).max(120).default(8),
  condensed_max_seconds: z.number().min(30).max(600).default(180),
  short_max_seconds: z.number().min(5).max(59).default(59),
  max_shorts: z.number().int().min(1).max(2).default(2),
  short_min_confidence: z.number().min(0).max(1).default(0.55),
});

export const matchEditPlanSchema = z.object({
  schema_version: z.literal(MATCH_EDIT_PLAN_SCHEMA_VERSION),
  id: z.string().uuid(),
  timeline_id: z.string().uuid(),
  match_source_id: z.string().uuid(),
  server_environment: z.enum(GAME_SERVER_ENVIRONMENTS),
  game_patch_id: z.string().uuid(),
  source_duration_seconds: z.number().min(0),
  config: matchEditPlanConfigSchema,
  condensed_segments: z.array(matchEditSegmentSchema).max(500),
  /** Estimated condensed output duration after speed-up (before hard trim). */
  condensed_duration_seconds: z.number().min(0),
  shorts: z.array(matchEditShortCandidateSchema).max(2),
  created_at: z.string().datetime(),
  notes: z.string().trim().max(4000).default(''),
});

export const matchEditArtifactSchema = z.object({
  kind: z.enum(['condensed', 'short']),
  short_rank: z.number().int().min(1).max(2).nullable().default(null),
  path: z.string().min(1).max(2048),
  duration_seconds: z.number().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  burned_captions: z.boolean().default(false),
  quality_ok: z.boolean(),
  quality_notes: z.array(z.string()).default([]),
});

export const matchEditRecordSchema = z.object({
  schema_version: z.literal(MATCH_EDIT_EXPORT_SCHEMA_VERSION),
  id: z.string().uuid(),
  plan_id: z.string().uuid(),
  timeline_id: z.string().uuid(),
  match_source_id: z.string().uuid(),
  status: z.enum(MATCH_EDIT_STATUSES),
  artifacts: z.array(matchEditArtifactSchema).max(8),
  approved_at: z.string().datetime().nullable().default(null),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  notes: z.string().trim().max(4000).default(''),
});

export const approveMatchDistributionSchema = z.object({
  edit_id: z.string().uuid(),
  confirmation_phrase: z.string().trim().min(1).max(128),
});

export type MatchEditSegment = z.infer<typeof matchEditSegmentSchema>;
export type MatchEditShortCandidate = z.infer<typeof matchEditShortCandidateSchema>;
export type MatchEditPlanConfig = z.infer<typeof matchEditPlanConfigSchema>;
export type MatchEditPlan = z.infer<typeof matchEditPlanSchema>;
export type MatchEditArtifact = z.infer<typeof matchEditArtifactSchema>;
export type MatchEditRecord = z.infer<typeof matchEditRecordSchema>;
export type ApproveMatchDistributionPayload = z.infer<typeof approveMatchDistributionSchema>;

export function parseMatchEditPlan(input: unknown): MatchEditPlan {
  return matchEditPlanSchema.parse(input);
}

export function safeParseMatchEditPlan(input: unknown) {
  return matchEditPlanSchema.safeParse(input);
}

export function parseMatchEditRecord(input: unknown): MatchEditRecord {
  return matchEditRecordSchema.parse(input);
}

export function emptyMatchEditPlanConfig(
  overrides: Partial<MatchEditPlanConfig> = {},
): MatchEditPlanConfig {
  return matchEditPlanConfigSchema.parse(overrides);
}
