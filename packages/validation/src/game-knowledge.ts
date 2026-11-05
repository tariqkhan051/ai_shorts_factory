import { z } from 'zod';
import {
  GAME_PATCH_STATUSES,
  GAME_SERVER_ENVIRONMENTS,
  HERO_ABILITY_SLOTS,
  KNOWLEDGE_SOURCE_TYPES,
} from '@ai-shorts-factory/shared-types';

export const gameServerEnvironmentSchema = z.enum(GAME_SERVER_ENVIRONMENTS);
export const gamePatchStatusSchema = z.enum(GAME_PATCH_STATUSES);
export const heroAbilitySlotSchema = z.enum(HERO_ABILITY_SLOTS);
export const knowledgeSourceTypeSchema = z.enum(KNOWLEDGE_SOURCE_TYPES);

export const createGameProfileSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case'),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4000).default(''),
  terminology: z.record(z.string(), z.string()).default({}),
  gameplay_rules: z.string().trim().max(20000).default(''),
});

export const updateGameProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(4000).optional(),
  terminology: z.record(z.string(), z.string()).optional(),
  gameplay_rules: z.string().trim().max(20000).optional(),
});

export const upsertGameServerProfileSchema = z.object({
  environment: gameServerEnvironmentSchema,
  terminology: z.record(z.string(), z.string()).default({}),
  recognition_config: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().trim().max(4000).default(''),
});

export const createGamePatchSchema = z.object({
  server_environment: gameServerEnvironmentSchema,
  patch_code: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(200),
  effective_from: z.string().datetime().nullable().optional(),
  effective_to: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(8000).default(''),
  previous_patch_id: z.string().uuid().nullable().optional(),
});

export const updateGamePatchDraftSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  effective_from: z.string().datetime().nullable().optional(),
  effective_to: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(8000).optional(),
  previous_patch_id: z.string().uuid().nullable().optional(),
});

export const createKnowledgeSourceSchema = z.object({
  source_type: knowledgeSourceTypeSchema,
  title: z.string().trim().min(1).max(240),
  url: z.string().trim().url().nullable().optional(),
  published_at: z.string().datetime().nullable().optional(),
  retrieved_at: z.string().datetime().nullable().optional(),
  checksum_sha256: z.string().trim().max(128).nullable().optional(),
  notes: z.string().trim().max(4000).default(''),
});

export const createHeroKnowledgeSchema = z.object({
  hero_key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, 'hero_key must be lowercase snake_case'),
  name: z.string().trim().min(1).max(120),
  roles: z.array(z.string().trim().max(40)).max(12).default([]),
  lanes: z.array(z.string().trim().max(40)).max(12).default([]),
  description: z.string().trim().max(8000).default(''),
  passive: z.record(z.string(), z.unknown()).default({}),
  damage_types: z.array(z.string().trim().max(40)).max(12).default([]),
  cc_types: z.array(z.string().trim().max(40)).max(24).default([]),
  sound_signature_notes: z.string().trim().max(2000).default(''),
  revamp_notes: z.string().trim().max(4000).default(''),
  portrait_asset_id: z.string().uuid().nullable().optional(),
});

export const updateHeroKnowledgeSchema = createHeroKnowledgeSchema.partial().omit({
  hero_key: true,
});

export const createAbilityKnowledgeSchema = z.object({
  ability_key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, 'ability_key must be lowercase snake_case'),
  slot: heroAbilitySlotSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(8000).default(''),
  effects: z.string().trim().max(8000).default(''),
  damage_types: z.array(z.string().trim().max(40)).max(12).default([]),
  cc_types: z.array(z.string().trim().max(40)).max(24).default([]),
  /** True only for Advance/experimental facts — never activate on Original matches. */
  experimental: z.boolean().default(false),
});

export const updateAbilityKnowledgeSchema = createAbilityKnowledgeSchema.partial().omit({
  ability_key: true,
});

export const activateProjectGameKnowledgeSchema = z.object({
  game_profile_id: z.string().uuid(),
  server_environment: gameServerEnvironmentSchema,
  game_patch_id: z.string().uuid(),
});

export const bindVideoGameKnowledgeSchema = z.object({
  server_environment: gameServerEnvironmentSchema,
  game_patch_id: z.string().uuid(),
});

export type CreateGameProfilePayload = z.input<typeof createGameProfileSchema>;
export type UpdateGameProfilePayload = z.input<typeof updateGameProfileSchema>;
export type UpsertGameServerProfilePayload = z.input<typeof upsertGameServerProfileSchema>;
export type CreateGamePatchPayload = z.input<typeof createGamePatchSchema>;
export type UpdateGamePatchDraftPayload = z.input<typeof updateGamePatchDraftSchema>;
export type CreateKnowledgeSourcePayload = z.input<typeof createKnowledgeSourceSchema>;
export type CreateHeroKnowledgePayload = z.input<typeof createHeroKnowledgeSchema>;
export type UpdateHeroKnowledgePayload = z.input<typeof updateHeroKnowledgeSchema>;
export type CreateAbilityKnowledgePayload = z.input<typeof createAbilityKnowledgeSchema>;
export type UpdateAbilityKnowledgePayload = z.input<typeof updateAbilityKnowledgeSchema>;
export type ActivateProjectGameKnowledgePayload = z.input<
  typeof activateProjectGameKnowledgeSchema
>;
export type BindVideoGameKnowledgePayload = z.input<typeof bindVideoGameKnowledgeSchema>;

export function parseCreateGameProfile(input: unknown): CreateGameProfilePayload {
  return createGameProfileSchema.parse(input);
}

export function parseCreateGamePatch(input: unknown): CreateGamePatchPayload {
  return createGamePatchSchema.parse(input);
}

export function parseActivateProjectGameKnowledge(
  input: unknown,
): ActivateProjectGameKnowledgePayload {
  return activateProjectGameKnowledgeSchema.parse(input);
}

export function parseBindVideoGameKnowledge(input: unknown): BindVideoGameKnowledgePayload {
  return bindVideoGameKnowledgeSchema.parse(input);
}
