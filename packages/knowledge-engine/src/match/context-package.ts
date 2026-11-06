import type { ActivatedGameKnowledge, GameKnowledgeRepository } from '@ai-shorts-factory/database';
import type { GameServerEnvironment } from '@ai-shorts-factory/shared-types';
import type { MemoryKnowledgeEngineStore } from '../store/memory-engine-store.js';
import type { MatchKnowledgeContextPackage } from '../types.js';

export type BuildMatchKnowledgeContextInput = {
  userId: string;
  knowledge: GameKnowledgeRepository;
  engineStore: MemoryKnowledgeEngineStore;
  serverEnvironment: GameServerEnvironment;
  gamePatchId: string | null;
  patchResolution: 'bound' | 'unknown' | 'draft_only';
  /** Hero keys observed in the match (roster / timeline). */
  relevantHeroKeys: string[];
  maxHeroes?: number;
  maxItems?: number;
  maxStrategies?: number;
  maxPatchChanges?: number;
};

/**
 * Compact, server-scoped knowledge package for Match Studio commentary.
 * Never dumps the entire KB — only relevant heroes / recent changes / related items.
 */
export async function buildMatchKnowledgeContextPackage(
  input: BuildMatchKnowledgeContextInput,
): Promise<MatchKnowledgeContextPackage> {
  const maxHeroes = input.maxHeroes ?? 12;
  const maxItems = input.maxItems ?? 8;
  const maxStrategies = input.maxStrategies ?? 5;
  const maxPatchChanges = input.maxPatchChanges ?? 12;

  let activated: ActivatedGameKnowledge | null = null;
  let patchCode: string | null = null;

  if (input.gamePatchId && input.patchResolution === 'bound') {
    activated = await input.knowledge.resolveActivatedKnowledge(input.userId, {
      server_environment: input.serverEnvironment,
      game_patch_id: input.gamePatchId,
    });
    patchCode = activated.patch.patch_code;
  }

  const wanted = new Set(input.relevantHeroKeys.map((k) => k.toLowerCase()));
  const heroes =
    activated?.heroes
      .filter((hero) => wanted.size === 0 || wanted.has(hero.hero_key) || wanted.has(hero.name.toLowerCase()))
      .slice(0, maxHeroes)
      .map((hero) => ({
        hero_key: hero.hero_key,
        name: hero.name,
        roles: hero.roles,
        lanes: hero.lanes,
        abilities: hero.abilities.map((ability) => ({
          ability_key: ability.ability_key,
          slot: ability.slot,
          name: ability.name,
          description: ability.description.slice(0, 400),
          experimental: ability.experimental,
        })),
        verification_status: 'published_patch',
        confidence_score: 0.85,
        source: activated.sources[0]?.source_type ?? 'game_patch',
      })) ?? [];

  // If roster empty, still provide a tiny slice for grounding terminology — but keep compact.
  if (heroes.length === 0 && activated) {
    for (const hero of activated.heroes.slice(0, Math.min(3, maxHeroes))) {
      heroes.push({
        hero_key: hero.hero_key,
        name: hero.name,
        roles: hero.roles,
        lanes: hero.lanes,
        abilities: hero.abilities.slice(0, 4).map((ability) => ({
          ability_key: ability.ability_key,
          slot: ability.slot,
          name: ability.name,
          description: ability.description.slice(0, 400),
          experimental: ability.experimental,
        })),
        verification_status: 'published_patch',
        confidence_score: 0.7,
        source: activated.sources[0]?.source_type ?? 'game_patch',
      });
    }
  }

  const patches = input.engineStore.listPatchesExt(input.userId, input.serverEnvironment);
  const latest = patches.sort((a, b) => Date.parse(b.first_discovered_at) - Date.parse(a.first_discovered_at))[0];
  const relevant_patch_changes: MatchKnowledgeContextPackage['relevant_patch_changes'] = [];
  if (latest) {
    for (const line of latest.hero_buffs.slice(0, maxPatchChanges / 2)) {
      relevant_patch_changes.push({ change_kind: 'buff', target_key: 'hero', summary: String(line) });
    }
    for (const line of latest.hero_nerfs.slice(0, maxPatchChanges / 2)) {
      relevant_patch_changes.push({ change_kind: 'nerf', target_key: 'hero', summary: String(line) });
    }
  }

  const items = input.engineStore
    .listItems(input.userId, input.serverEnvironment)
    .slice(0, maxItems)
    .map((item) => ({
      item_key: item.item_key,
      name: item.name,
      category: item.category,
      cost: item.cost,
    }));

  const strategies = input.engineStore
    .listStrategies(input.userId, input.serverEnvironment)
    .filter((s) => {
      if (wanted.size === 0) return true;
      return s.hero_keys.some((k) => wanted.has(k.toLowerCase()));
    })
    .slice(0, maxStrategies)
    .map((s) => ({
      strategy_key: s.strategy_key,
      title: s.title,
      body: s.body.slice(0, 500),
      is_community: s.is_community,
    }));

  return {
    server_type: input.serverEnvironment,
    patch_code: patchCode,
    patch_resolution: input.patchResolution,
    heroes,
    relevant_patch_changes,
    items,
    strategies,
    grounding_rules: [
      'Only state facts present in this package or timeline evidence.',
      'Never invent cooldowns, damage numbers, or patch changes.',
      'Community-derived strategies must not be presented as official.',
      'Advance Server facts must never be used for Original Server matches (and vice versa).',
      'If verification is missing, speak uncertainly or omit the claim.',
    ],
  };
}
