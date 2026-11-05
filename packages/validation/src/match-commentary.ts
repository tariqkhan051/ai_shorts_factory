import { z } from 'zod';
import { GAME_SERVER_ENVIRONMENTS, MATCH_EVENT_TYPES } from '@ai-shorts-factory/shared-types';

export const MATCH_COMMENTARY_SCHEMA_VERSION = 'match-commentary-v1' as const;

/** Factual claim types must cite a timeline event_id. */
export const COMMENTARY_CLAIM_TYPES = [
  'kill',
  'turtle',
  'lord',
  'turret',
  'teamfight',
  'ability',
  'color',
  'prediction',
] as const;

export const commentaryClaimTypeSchema = z.enum(COMMENTARY_CLAIM_TYPES);

export const matchCommentaryLineSchema = z.object({
  id: z.string().uuid(),
  /** Required for factual claims; null only for color/prediction. */
  event_id: z.string().uuid().nullable(),
  claim_type: commentaryClaimTypeSchema,
  text: z.string().trim().min(1).max(500),
  /** True only when the line asserts a verified event/ability fact. */
  confirmed: z.boolean(),
  timestamp_seconds: z.number().min(0).nullable().optional(),
  hero_keys_mentioned: z.array(z.string().trim().max(64)).max(12).default([]),
  player_tags_mentioned: z.array(z.string().trim().max(64)).max(12).default([]),
  ability_keys_mentioned: z.array(z.string().trim().max(64)).max(12).default([]),
});

export const matchCommentaryScriptSchema = z.object({
  schema_version: z.literal(MATCH_COMMENTARY_SCHEMA_VERSION),
  match_source_id: z.string().uuid(),
  timeline_id: z.string().uuid(),
  server_environment: z.enum(GAME_SERVER_ENVIRONMENTS),
  game_patch_id: z.string().uuid(),
  language: z.string().trim().min(2).max(32).default('en'),
  lines: z.array(matchCommentaryLineSchema).max(200),
  generated_at: z.string().datetime(),
  notes: z.string().trim().max(4000).default(''),
});

/** Polished wording from ChatGPT — still must cite event_ids; never invent facts. */
export const matchCommentaryPolishPackageSchema = z.object({
  schema_version: z.literal(MATCH_COMMENTARY_SCHEMA_VERSION),
  timeline_id: z.string().uuid(),
  lines: z
    .array(
      z.object({
        id: z.string().uuid(),
        event_id: z.string().uuid().nullable(),
        claim_type: commentaryClaimTypeSchema,
        text: z.string().trim().min(1).max(500),
        confirmed: z.boolean(),
        timestamp_seconds: z.number().min(0).nullable().optional(),
        hero_keys_mentioned: z.array(z.string().trim().max(64)).max(12).default([]),
        player_tags_mentioned: z.array(z.string().trim().max(64)).max(12).default([]),
        ability_keys_mentioned: z.array(z.string().trim().max(64)).max(12).default([]),
      }),
    )
    .max(200),
});

export type CommentaryClaimType = z.infer<typeof commentaryClaimTypeSchema>;
export type MatchCommentaryLine = z.infer<typeof matchCommentaryLineSchema>;
export type MatchCommentaryScript = z.infer<typeof matchCommentaryScriptSchema>;
export type MatchCommentaryPolishPackage = z.infer<typeof matchCommentaryPolishPackageSchema>;

export function parseMatchCommentaryScript(input: unknown): MatchCommentaryScript {
  return matchCommentaryScriptSchema.parse(input);
}

export function safeParseMatchCommentaryScript(input: unknown) {
  return matchCommentaryScriptSchema.safeParse(input);
}

export function parseMatchCommentaryPolishPackage(input: unknown): MatchCommentaryPolishPackage {
  return matchCommentaryPolishPackageSchema.parse(input);
}

export function safeParseMatchCommentaryPolishPackage(input: unknown) {
  return matchCommentaryPolishPackageSchema.safeParse(input);
}

export function formatMatchCommentaryErrors(
  result: ReturnType<typeof safeParseMatchCommentaryScript>,
): string[] {
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : 'root';
    return `${path}: ${issue.message}`;
  });
}

export const FACTUAL_CLAIM_TYPES = new Set<CommentaryClaimType>([
  'kill',
  'turtle',
  'lord',
  'turret',
  'teamfight',
  'ability',
]);

export function claimTypeForEventType(
  eventType: (typeof MATCH_EVENT_TYPES)[number],
): CommentaryClaimType {
  switch (eventType) {
    case 'kill':
      return 'kill';
    case 'turtle':
      return 'turtle';
    case 'lord':
      return 'lord';
    case 'turret':
      return 'turret';
    case 'teamfight':
      return 'teamfight';
    default:
      return 'color';
  }
}
