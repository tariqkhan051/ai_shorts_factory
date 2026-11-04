import { z } from 'zod';
import {
  BUSINESS_DEFAULTS,
  CONTENT_CATEGORIES,
  VISUAL_STYLES,
} from '@ai-shorts-factory/shared-types';

/**
 * Versioned screenplay schema (v1).
 * Soft-evolved for character bible fields while accepting legacy JSON.
 */
export const SCREENPLAY_SCHEMA_VERSION = '1.0.0' as const;

export const visualIdentityStructuredSchemaV1 = z.object({
  face: z.string().default(''),
  hair: z.string().default(''),
  eyes: z.string().default(''),
  skin: z.string().default(''),
  clothing: z.string().default(''),
  body: z.string().default(''),
  distinctive_features: z.string().default(''),
  accessories: z.string().default(''),
});

export type VisualIdentityStructuredV1 = z.infer<typeof visualIdentityStructuredSchemaV1>;

/** Accept legacy string or structured object; always emit structured. */
export const visualIdentitySchemaV1 = z.preprocess((value) => {
  if (typeof value === 'string') {
    const text = value.trim();
    return {
      face: '',
      hair: '',
      eyes: '',
      skin: '',
      clothing: '',
      body: '',
      distinctive_features: text,
      accessories: '',
    };
  }
  return value;
}, visualIdentityStructuredSchemaV1);

export function formatVisualIdentity(identity: VisualIdentityStructuredV1 | string): string {
  if (typeof identity === 'string') return identity.trim();
  const parts = [
    identity.face,
    identity.hair,
    identity.eyes,
    identity.skin,
    identity.clothing,
    identity.body,
    identity.distinctive_features,
    identity.accessories,
  ]
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.join('; ');
}

export const characterSchemaV1 = z.object({
  character_id: z.string().min(1).optional(),
  name: z.string().min(1),
  role: z.string().default(''),
  age_range: z.string().default(''),
  description: z.string().min(1),
  visual_identity: visualIdentitySchemaV1,
  /** Legacy flat fields — merged into visual_identity during normalize. */
  clothing: z.string().optional(),
  appearance_details: z.string().optional(),
  reference_image_prompt: z.string().default(''),
  continuity_rules: z.string().default(''),
  voice_description: z.string().optional(),
  dialogue_style: z.string().optional(),
});

export const sceneSchemaV1 = z.object({
  scene_number: z.number().int().min(1).max(BUSINESS_DEFAULTS.sceneCount),
  title: z.string().min(1),
  duration_seconds: z.number().positive().max(BUSINESS_DEFAULTS.finalVideoMaxSeconds),
  visual_description: z.string().min(1),
  flow_prompt: z.string().min(1),
  /** Alias accepted on import; normalized into flow_prompt when missing. */
  visual_prompt: z.string().optional(),
  character_ids: z.array(z.string().min(1)).default([]),
  narration: z.string().default(''),
  dialogue: z.string().default(''),
  text_overlay: z.string().default(''),
  transition_out: z.string().default('cut'),
  audio_direction: z.string().default(''),
  camera_direction: z.string().default(''),
  environment: z.string().default(''),
  lighting: z.string().default(''),
});

export const publishingMetadataSchemaV1 = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

export const screenplaySchemaV1 = z
  .object({
    schema_version: z.literal(SCREENPLAY_SCHEMA_VERSION).default(SCREENPLAY_SCHEMA_VERSION),
    title: z.string().min(1),
    category: z.enum(CONTENT_CATEGORIES),
    visual_style: z.enum(VISUAL_STYLES),
    story_summary: z.string().min(1),
    hook: z.string().min(1),
    characters: z.array(characterSchemaV1).min(1),
    scenes: z.array(sceneSchemaV1).length(BUSINESS_DEFAULTS.sceneCount),
    ending: z.string().min(1),
    publishing_metadata: publishingMetadataSchemaV1,
  })
  .superRefine((value, ctx) => {
    const numbers = value.scenes.map((s) => s.scene_number).sort((a, b) => a - b);
    for (let i = 0; i < BUSINESS_DEFAULTS.sceneCount; i += 1) {
      if (numbers[i] !== i + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes'],
          message: `Scenes must be numbered 1–${BUSINESS_DEFAULTS.sceneCount} without gaps or duplicates.`,
        });
        break;
      }
    }

    const totalDuration = value.scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0);
    if (totalDuration > BUSINESS_DEFAULTS.finalVideoMaxSeconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scenes'],
        message: `Total scene duration (${totalDuration}s) exceeds maximum final video duration (${BUSINESS_DEFAULTS.finalVideoMaxSeconds}s).`,
      });
    }

    const ids = value.characters
      .map((character) => character.character_id)
      .filter((id): id is string => Boolean(id));
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['characters'],
          message: `Duplicate character_id "${id}". Each character must have a unique ID.`,
        });
      }
      seen.add(id);
    }

    const knownIds = new Set(ids);
    value.scenes.forEach((scene, sceneIndex) => {
      for (const characterId of scene.character_ids) {
        if (!knownIds.has(characterId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['scenes', sceneIndex, 'character_ids'],
            message: `Scene ${scene.scene_number} references unknown character_id "${characterId}".`,
          });
        }
      }
    });
  });

export type ScreenplayV1 = z.infer<typeof screenplaySchemaV1>;
export type SceneV1 = z.infer<typeof sceneSchemaV1>;
export type CharacterV1 = z.infer<typeof characterSchemaV1>;

export function parseScreenplayV1(input: unknown): ScreenplayV1 {
  return screenplaySchemaV1.parse(input);
}

export function safeParseScreenplayV1(input: unknown) {
  return screenplaySchemaV1.safeParse(input);
}

export function formatScreenplayErrors(result: ReturnType<typeof safeParseScreenplayV1>): string[] {
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'screenplay';
    return `${path}: ${issue.message}`;
  });
}

/** Stable slug for screenplay-local character IDs. */
export function slugifyCharacterId(name: string, used: Set<string>): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'character';
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}
