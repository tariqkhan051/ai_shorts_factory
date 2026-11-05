import { z } from 'zod';
import {
  MATCH_EVENT_PHASES,
  MATCH_EVENT_TYPES,
  MATCH_TIMELINE_STATUSES,
} from '@ai-shorts-factory/shared-types';
import { hudRecognitionConfigSchema } from './match-analysis.js';

export const MATCH_TIMELINE_EXPORT_SCHEMA_VERSION = 'match-timeline-export-v1' as const;

export const matchEventParticipantSchema = z.object({
  role: z.enum(['actor', 'target', 'assist', 'unknown']).default('unknown'),
  player_tag: z.string().trim().max(64).nullable().optional(),
  hero_key: z.string().trim().max(64).nullable().optional(),
  hero_name_raw: z.string().trim().max(120).nullable().optional(),
});

export const matchEventEvidenceSchema = z.object({
  region_id: z.string().trim().min(1).max(64),
  frame_timestamp_seconds: z.number().min(0),
  ocr_text: z.string().trim().max(4000).default(''),
  ocr_confidence: z.number().min(0).max(1).nullable().optional(),
  ocr_provider: z.string().trim().max(64).default('unknown'),
});

export const matchEventWindowSchema = z.object({
  phase: z.enum(MATCH_EVENT_PHASES),
  start_seconds: z.number().min(0),
  end_seconds: z.number().min(0),
});

export const matchEventCandidateSchema = z.object({
  id: z.string().uuid().optional(),
  event_type: z.enum(MATCH_EVENT_TYPES),
  timestamp_seconds: z.number().min(0),
  confidence: z.number().min(0).max(1),
  participants: z.array(matchEventParticipantSchema).max(12).default([]),
  evidence: z.array(matchEventEvidenceSchema).max(20).default([]),
  windows: z.array(matchEventWindowSchema).length(3).optional(),
  notes: z.string().trim().max(2000).default(''),
  rejected: z.boolean().default(false),
  source: z.enum(['detector', 'human']).default('detector'),
});

export const correctMatchEventSchema = z.object({
  event_id: z.string().uuid(),
  event_type: z.enum(MATCH_EVENT_TYPES).optional(),
  timestamp_seconds: z.number().min(0).optional(),
  confidence: z.number().min(0).max(1).optional(),
  participants: z.array(matchEventParticipantSchema).max(12).optional(),
  notes: z.string().trim().max(2000).optional(),
  rejected: z.boolean().optional(),
});

export const addManualMatchEventSchema = z.object({
  event_type: z.enum(MATCH_EVENT_TYPES),
  timestamp_seconds: z.number().min(0),
  confidence: z.number().min(0).max(1).default(1),
  participants: z.array(matchEventParticipantSchema).max(12).default([]),
  notes: z.string().trim().max(2000).default(''),
});

export const eventDetectionConfigSchema = z.object({
  pre_seconds: z.number().min(0).max(60).default(3),
  main_seconds: z.number().min(0.1).max(30).default(2),
  post_seconds: z.number().min(0).max(60).default(3),
  sample_interval_seconds: z.number().min(0.5).max(30).default(2),
  max_frames: z.number().int().min(1).max(120).default(30),
  recognition: hudRecognitionConfigSchema.default({
    hud_profile: 'original_kill_feed_v1',
    sample_timestamps_seconds: [],
    max_frames: 24,
    regions: [
      {
        id: 'kill_feed',
        label: 'Kill feed',
        box: { x: 0.62, y: 0.08, w: 0.35, h: 0.28 },
      },
    ],
  }),
});

export const matchTimelineExportSchema = z.object({
  schema_version: z.literal(MATCH_TIMELINE_EXPORT_SCHEMA_VERSION),
  timeline_id: z.string().uuid(),
  match_source_id: z.string().uuid(),
  status: z.enum(MATCH_TIMELINE_STATUSES),
  server_environment: z.string(),
  game_patch_id: z.string().uuid(),
  events: z.array(matchEventCandidateSchema),
  exported_at: z.string().datetime(),
});

export type MatchEventParticipant = z.infer<typeof matchEventParticipantSchema>;
export type MatchEventEvidence = z.infer<typeof matchEventEvidenceSchema>;
export type MatchEventWindow = z.infer<typeof matchEventWindowSchema>;
export type MatchEventCandidate = z.infer<typeof matchEventCandidateSchema>;
export type CorrectMatchEventPayload = z.input<typeof correctMatchEventSchema>;
export type AddManualMatchEventPayload = z.input<typeof addManualMatchEventSchema>;
export type EventDetectionConfig = z.infer<typeof eventDetectionConfigSchema>;
export type MatchTimelineExport = z.infer<typeof matchTimelineExportSchema>;

export function parseEventDetectionConfig(input: unknown): EventDetectionConfig {
  return eventDetectionConfigSchema.parse(input);
}

export function emptyEventDetectionConfig(
  partial?: Partial<EventDetectionConfig>,
): EventDetectionConfig {
  return eventDetectionConfigSchema.parse(partial ?? {});
}
