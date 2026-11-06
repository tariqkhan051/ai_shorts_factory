import { z } from 'zod';
import type { ExtractedHero, PatchSummary } from '../types.js';
import { clampConfidence, toSnakeKey } from '../util.js';

const heroSchema = z.object({
  hero_key: z
    .string()
    .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
  name: z.string().min(1).max(120),
  roles: z.array(z.string()).max(12),
  lanes: z.array(z.string()).max(12),
  abilities: z
    .array(
      z.object({
        ability_key: z.string().min(1),
        slot: z.enum(['passive', 'skill1', 'skill2', 'ultimate', 'other']),
        name: z.string().min(1),
        description: z.string(),
        experimental: z.boolean(),
      }),
    )
    .max(20),
  confidence_score: z.number().min(0).max(1),
});

export type ValidationResult<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

/**
 * Validate extracted hero records. Rejects malformed data.
 * Gameplay-critical numerical claims without evidence reduce confidence;
 * fabricated numbers are never invented here.
 */
export function validateExtractedHero(hero: ExtractedHero): ValidationResult<ExtractedHero> {
  const warnings: string[] = [];
  const normalized: ExtractedHero = {
    ...hero,
    hero_key: toSnakeKey(hero.hero_key || hero.name),
    abilities: hero.abilities.map((ability) => ({
      ...ability,
      ability_key: toSnakeKey(ability.ability_key || ability.name),
      experimental: Boolean(ability.experimental),
    })),
    confidence_score: clampConfidence(hero.confidence_score),
  };

  for (const ability of normalized.abilities) {
    if (ability.cooldown && !/\d/.test(ability.cooldown)) {
      warnings.push(`Non-numeric cooldown for ${ability.ability_key} demoted to unknown`);
      ability.cooldown = null;
      normalized.unknown_fields = [...new Set([...normalized.unknown_fields, 'ability_cooldowns'])];
      normalized.confidence_score = clampConfidence(normalized.confidence_score - 0.05);
    }
    // Stronger bar for numerical gameplay claims: if cooldown present but no digits evidence in text
    if (
      ability.cooldown &&
      ability.description &&
      !ability.description.toLowerCase().includes(ability.cooldown.split(/[./\s]/)[0] ?? '')
    ) {
      warnings.push(`Cooldown for ${ability.ability_key} lacks matching evidence — marked unknown`);
      ability.cooldown = null;
      normalized.confidence_score = clampConfidence(normalized.confidence_score - 0.1);
    }
  }

  const parsed = heroSchema.safeParse(normalized);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      warnings,
    };
  }
  return { ok: true, value: normalized, warnings };
}

export function validatePatchSummary(summary: PatchSummary): ValidationResult<PatchSummary> {
  if (!summary.patch_identifier.trim()) {
    return { ok: false, errors: ['patch_identifier required'], warnings: [] };
  }
  if (!summary.content_sha256 || summary.content_sha256.length < 16) {
    return { ok: false, errors: ['content_sha256 required for idempotent ingestion'], warnings: [] };
  }
  if (summary.server_type !== 'original' && summary.server_type !== 'advance') {
    return { ok: false, errors: ['invalid server_type'], warnings: [] };
  }
  return { ok: true, value: summary, warnings: [] };
}

/** Detect contradictory role claims between two extracts of the same hero. */
export function detectHeroContradiction(
  a: ExtractedHero,
  b: ExtractedHero,
): string[] {
  const issues: string[] = [];
  if (a.hero_key !== b.hero_key) return issues;
  const roleA = new Set(a.roles.map((r) => r.toLowerCase()));
  const roleB = new Set(b.roles.map((r) => r.toLowerCase()));
  const onlyA = [...roleA].filter((r) => !roleB.has(r));
  const onlyB = [...roleB].filter((r) => !roleA.has(r));
  if (onlyA.length && onlyB.length && roleA.size > 0 && roleB.size > 0) {
    issues.push(
      `Contradictory roles for ${a.hero_key}: [${[...roleA].join(',')}] vs [${[...roleB].join(',')}]`,
    );
  }
  return issues;
}
