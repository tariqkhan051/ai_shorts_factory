import { z } from 'zod';
import {
  GAME_SERVER_ENVIRONMENTS,
  HERO_ABILITY_SLOTS,
  KNOWLEDGE_SOURCE_TYPES,
} from '@ai-shorts-factory/shared-types';

/** Versioned MLBB / game patch research import package (Milestone 2). */
export const GAME_KNOWLEDGE_IMPORT_SCHEMA_VERSION = 'game-knowledge-import-v1' as const;

const snakeKey = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, 'must be lowercase snake_case');

export const gameKnowledgeImportAbilitySchemaV1 = z.object({
  ability_key: snakeKey,
  slot: z.enum(HERO_ABILITY_SLOTS),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(8000).default(''),
  effects: z.string().trim().max(8000).default(''),
  damage_types: z.array(z.string().trim().max(40)).max(12).default([]),
  cc_types: z.array(z.string().trim().max(40)).max(24).default([]),
  experimental: z.boolean().default(false),
});

export const gameKnowledgeImportHeroSchemaV1 = z.object({
  hero_key: snakeKey,
  name: z.string().trim().min(1).max(120),
  roles: z.array(z.string().trim().max(40)).max(12).default([]),
  lanes: z.array(z.string().trim().max(40)).max(12).default([]),
  description: z.string().trim().max(8000).default(''),
  passive: z.record(z.string(), z.unknown()).default({}),
  damage_types: z.array(z.string().trim().max(40)).max(12).default([]),
  cc_types: z.array(z.string().trim().max(40)).max(24).default([]),
  sound_signature_notes: z.string().trim().max(2000).default(''),
  revamp_notes: z.string().trim().max(4000).default(''),
  abilities: z.array(gameKnowledgeImportAbilitySchemaV1).max(20).default([]),
});

export const gameKnowledgeImportSourceSchemaV1 = z.object({
  source_type: z.enum(KNOWLEDGE_SOURCE_TYPES),
  title: z.string().trim().min(1).max(240),
  url: z.string().trim().url().nullable().optional(),
  published_at: z.string().datetime().nullable().optional(),
  retrieved_at: z.string().datetime().nullable().optional(),
  checksum_sha256: z.string().trim().max(128).nullable().optional(),
  notes: z.string().trim().max(4000).default(''),
});

export const gameKnowledgeImportPackageSchemaV1 = z
  .object({
    schema_version: z.literal(GAME_KNOWLEDGE_IMPORT_SCHEMA_VERSION),
    game: z.object({
      slug: z
        .string()
        .trim()
        .min(2)
        .max(64)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(4000).default(''),
      terminology: z.record(z.string(), z.string()).default({}),
      gameplay_rules: z.string().trim().max(20000).default(''),
    }),
    server_environment: z.enum(GAME_SERVER_ENVIRONMENTS),
    patch: z.object({
      patch_code: z.string().trim().min(1).max(64),
      title: z.string().trim().min(1).max(200),
      effective_from: z.string().datetime().nullable().optional(),
      effective_to: z.string().datetime().nullable().optional(),
      notes: z.string().trim().max(8000).default(''),
      /** Optional previous patch_code within the same environment for diff baseline. */
      previous_patch_code: z.string().trim().max(64).nullable().optional(),
    }),
    server_profile: z
      .object({
        terminology: z.record(z.string(), z.string()).default({}),
        recognition_config: z.record(z.string(), z.unknown()).default({}),
        notes: z.string().trim().max(4000).default(''),
      })
      .optional(),
    sources: z.array(gameKnowledgeImportSourceSchemaV1).max(50).default([]),
    heroes: z.array(gameKnowledgeImportHeroSchemaV1).max(200).default([]),
    research_meta: z
      .object({
        researcher: z.string().trim().max(120).optional(),
        research_date: z.string().datetime().nullable().optional(),
        notes: z.string().trim().max(4000).optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.server_environment === 'original') {
      for (const hero of value.heroes) {
        for (const ability of hero.abilities) {
          if (ability.experimental) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Original Server import cannot include experimental ability "${hero.hero_key}.${ability.ability_key}"`,
              path: ['heroes'],
            });
          }
        }
      }
    }
  });

export type GameKnowledgeImportPackageV1 = z.infer<typeof gameKnowledgeImportPackageSchemaV1>;
export type GameKnowledgeImportHeroV1 = z.infer<typeof gameKnowledgeImportHeroSchemaV1>;
export type GameKnowledgeImportAbilityV1 = z.infer<typeof gameKnowledgeImportAbilitySchemaV1>;

export function parseGameKnowledgeImportPackage(input: unknown): GameKnowledgeImportPackageV1 {
  return gameKnowledgeImportPackageSchemaV1.parse(input);
}

export function safeParseGameKnowledgeImportPackage(input: unknown) {
  return gameKnowledgeImportPackageSchemaV1.safeParse(input);
}

export function formatGameKnowledgeImportErrors(
  result: ReturnType<typeof safeParseGameKnowledgeImportPackage>,
): string[] {
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : 'root';
    return `${path}: ${issue.message}`;
  });
}
