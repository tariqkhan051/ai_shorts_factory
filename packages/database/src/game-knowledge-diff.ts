import type { GameKnowledgeImportPackageV1 } from '@ai-shorts-factory/validation';
import type {
  AbilityKnowledgeRecord,
  HeroKnowledgeRecord,
  KnowledgeSourceRecord,
} from './game-knowledge-types.js';

export type GameKnowledgeSnapshot = {
  patch_code: string | null;
  heroes: Array<{
    hero_key: string;
    name: string;
    roles: string[];
    lanes: string[];
    description: string;
    passive: Record<string, unknown>;
    damage_types: string[];
    cc_types: string[];
    sound_signature_notes: string;
    revamp_notes: string;
    abilities: Array<{
      ability_key: string;
      slot: string;
      name: string;
      description: string;
      effects: string;
      damage_types: string[];
      cc_types: string[];
      experimental: boolean;
    }>;
  }>;
  sources: Array<{
    source_type: string;
    title: string;
    url: string | null;
    checksum_sha256: string | null;
  }>;
};

export type GameKnowledgeDiffChange = {
  path: string;
  change: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
};

export type GameKnowledgeDiff = {
  baseline_patch_code: string | null;
  incoming_patch_code: string;
  server_environment: string;
  changes: GameKnowledgeDiffChange[];
  added_hero_keys: string[];
  removed_hero_keys: string[];
  changed_hero_keys: string[];
  is_noop: boolean;
  summary: string;
};

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

type HeroSnap = GameKnowledgeSnapshot['heroes'][number];
type AbilitySnap = HeroSnap['abilities'][number];

function heroMap(snapshot: GameKnowledgeSnapshot): Map<string, HeroSnap> {
  return new Map(snapshot.heroes.map((h) => [h.hero_key, h]));
}

export function snapshotFromImport(pkg: GameKnowledgeImportPackageV1): GameKnowledgeSnapshot {
  return {
    patch_code: pkg.patch.patch_code,
    heroes: pkg.heroes.map((hero) => ({
      hero_key: hero.hero_key,
      name: hero.name,
      roles: [...hero.roles],
      lanes: [...hero.lanes],
      description: hero.description,
      passive: { ...hero.passive },
      damage_types: [...hero.damage_types],
      cc_types: [...hero.cc_types],
      sound_signature_notes: hero.sound_signature_notes,
      revamp_notes: hero.revamp_notes,
      abilities: hero.abilities.map((ability) => ({
        ability_key: ability.ability_key,
        slot: ability.slot,
        name: ability.name,
        description: ability.description,
        effects: ability.effects,
        damage_types: [...ability.damage_types],
        cc_types: [...ability.cc_types],
        experimental: ability.experimental,
      })),
    })),
    sources: pkg.sources.map((source) => ({
      source_type: source.source_type,
      title: source.title,
      url: source.url ?? null,
      checksum_sha256: source.checksum_sha256 ?? null,
    })),
  };
}

export function snapshotFromRecords(input: {
  patchCode: string | null;
  heroes: HeroKnowledgeRecord[];
  abilitiesByHeroId: Map<string, AbilityKnowledgeRecord[]>;
  sources: KnowledgeSourceRecord[];
}): GameKnowledgeSnapshot {
  return {
    patch_code: input.patchCode,
    heroes: input.heroes.map((hero) => ({
      hero_key: hero.hero_key,
      name: hero.name,
      roles: [...hero.roles],
      lanes: [...hero.lanes],
      description: hero.description,
      passive: { ...hero.passive },
      damage_types: [...hero.damage_types],
      cc_types: [...hero.cc_types],
      sound_signature_notes: hero.sound_signature_notes,
      revamp_notes: hero.revamp_notes,
      abilities: (input.abilitiesByHeroId.get(hero.id) ?? []).map((ability) => ({
        ability_key: ability.ability_key,
        slot: ability.slot,
        name: ability.name,
        description: ability.description,
        effects: ability.effects,
        damage_types: [...ability.damage_types],
        cc_types: [...ability.cc_types],
        experimental: ability.experimental,
      })),
    })),
    sources: input.sources.map((source) => ({
      source_type: source.source_type,
      title: source.title,
      url: source.url,
      checksum_sha256: source.checksum_sha256,
    })),
  };
}

export function diffGameKnowledge(
  baseline: GameKnowledgeSnapshot | null,
  incoming: GameKnowledgeSnapshot,
  serverEnvironment: string,
): GameKnowledgeDiff {
  const changes: GameKnowledgeDiffChange[] = [];
  const baselineHeroes = baseline ? heroMap(baseline) : new Map();
  const incomingHeroes = heroMap(incoming);

  const added_hero_keys: string[] = [];
  const removed_hero_keys: string[] = [];
  const changed_hero_keys: string[] = [];

  for (const [key, hero] of incomingHeroes) {
    const prev = baselineHeroes.get(key);
    if (!prev) {
      added_hero_keys.push(key);
      changes.push({ path: `heroes.${key}`, change: 'added', after: hero });
      continue;
    }
    const { abilities: _prevAbilitiesUnused, ...prevCore } = prev;
    const { abilities: _nextAbilitiesUnused, ...nextCore } = hero;
    void _prevAbilitiesUnused;
    void _nextAbilitiesUnused;
    if (stableJson(prevCore) !== stableJson(nextCore)) {
      changed_hero_keys.push(key);
      changes.push({
        path: `heroes.${key}`,
        change: 'changed',
        before: prevCore,
        after: nextCore,
      });
    }

    const prevAbilities = new Map<string, AbilitySnap>(
      prev.abilities.map((a: AbilitySnap): [string, AbilitySnap] => [a.ability_key, a]),
    );
    const nextAbilities = new Map<string, AbilitySnap>(
      hero.abilities.map((a: AbilitySnap): [string, AbilitySnap] => [a.ability_key, a]),
    );
    for (const [abilityKey, ability] of nextAbilities) {
      const prior = prevAbilities.get(abilityKey);
      if (!prior) {
        changes.push({
          path: `heroes.${key}.abilities.${abilityKey}`,
          change: 'added',
          after: ability,
        });
        if (!changed_hero_keys.includes(key)) changed_hero_keys.push(key);
        continue;
      }
      if (stableJson(prior) !== stableJson(ability)) {
        changes.push({
          path: `heroes.${key}.abilities.${abilityKey}`,
          change: 'changed',
          before: prior,
          after: ability,
        });
        if (!changed_hero_keys.includes(key)) changed_hero_keys.push(key);
      }
    }
    for (const [abilityKey, ability] of prevAbilities) {
      if (!nextAbilities.has(abilityKey)) {
        changes.push({
          path: `heroes.${key}.abilities.${abilityKey}`,
          change: 'removed',
          before: ability,
        });
        if (!changed_hero_keys.includes(key)) changed_hero_keys.push(key);
      }
    }
  }

  for (const [key, hero] of baselineHeroes) {
    if (!incomingHeroes.has(key)) {
      removed_hero_keys.push(key);
      changes.push({ path: `heroes.${key}`, change: 'removed', before: hero });
    }
  }

  const baselineSources = new Set(
    (baseline?.sources ?? []).map((s) => `${s.source_type}|${s.title}|${s.checksum_sha256 ?? ''}`),
  );
  const incomingSources = new Set(
    incoming.sources.map((s) => `${s.source_type}|${s.title}|${s.checksum_sha256 ?? ''}`),
  );
  for (const key of incomingSources) {
    if (!baselineSources.has(key)) {
      changes.push({ path: `sources.${key}`, change: 'added', after: key });
    }
  }
  for (const key of baselineSources) {
    if (!incomingSources.has(key)) {
      changes.push({ path: `sources.${key}`, change: 'removed', before: key });
    }
  }

  const is_noop = changes.length === 0;
  const summary = is_noop
    ? `No knowledge changes vs baseline for ${serverEnvironment} patch ${incoming.patch_code}.`
    : `${changes.length} change(s) for ${serverEnvironment} patch ${incoming.patch_code}: +${added_hero_keys.length} heroes, -${removed_hero_keys.length} heroes, ~${changed_hero_keys.length} heroes updated.`;

  return {
    baseline_patch_code: baseline?.patch_code ?? null,
    incoming_patch_code: incoming.patch_code ?? 'unknown',
    server_environment: serverEnvironment,
    changes,
    added_hero_keys,
    removed_hero_keys,
    changed_hero_keys,
    is_noop,
    summary,
  };
}
