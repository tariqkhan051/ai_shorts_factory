import { randomUUID } from 'node:crypto';
import type { GameServerEnvironment } from '@ai-shorts-factory/shared-types';
import {
  createAbilityKnowledgeSchema,
  createGamePatchSchema,
  createGameProfileSchema,
  createHeroKnowledgeSchema,
  createKnowledgeSourceSchema,
  updateAbilityKnowledgeSchema,
  updateGamePatchDraftSchema,
  updateGameProfileSchema,
  updateHeroKnowledgeSchema,
  upsertGameServerProfileSchema,
  activateProjectGameKnowledgeSchema,
  bindVideoGameKnowledgeSchema,
  type ActivateProjectGameKnowledgePayload,
  type BindVideoGameKnowledgePayload,
  type CreateAbilityKnowledgePayload,
  type CreateGamePatchPayload,
  type CreateGameProfilePayload,
  type CreateHeroKnowledgePayload,
  type CreateKnowledgeSourcePayload,
  type UpdateAbilityKnowledgePayload,
  type UpdateGamePatchDraftPayload,
  type UpdateGameProfilePayload,
  type UpdateHeroKnowledgePayload,
  type UpsertGameServerProfilePayload,
} from '@ai-shorts-factory/validation';
import {
  assertCanActivatePatch,
  assertNoExperimentalLeak,
  assertPatchMutable,
  filterAbilitiesForEnvironment,
  GameKnowledgeActivationError,
} from './game-knowledge-activation.js';
import type {
  AbilityKnowledgeRecord,
  ActivatedGameKnowledge,
  GameKnowledgeRepository,
  GamePatchRecord,
  GameProfileRecord,
  GameServerProfileRecord,
  HeroKnowledgeRecord,
  KnowledgeSourceRecord,
  ProjectGameKnowledgeBinding,
  VideoGameKnowledgeBinding,
} from './game-knowledge-types.js';
import type { MemoryProjectRepository } from './memory-project-repository.js';
import type { MemoryVideoRepository } from './memory-video-repository.js';

function nowIso(): string {
  return new Date().toISOString();
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export class MemoryGameKnowledgeRepository implements GameKnowledgeRepository {
  private readonly profiles = new Map<string, GameProfileRecord>();
  private readonly serverProfiles = new Map<string, GameServerProfileRecord>();
  private readonly patches = new Map<string, GamePatchRecord>();
  private readonly sources = new Map<string, KnowledgeSourceRecord>();
  private readonly heroes = new Map<string, HeroKnowledgeRecord>();
  private readonly abilities = new Map<string, AbilityKnowledgeRecord>();

  constructor(
    private readonly projects: MemoryProjectRepository,
    private readonly videos: MemoryVideoRepository,
  ) {}

  clear(): void {
    this.profiles.clear();
    this.serverProfiles.clear();
    this.patches.clear();
    this.sources.clear();
    this.heroes.clear();
    this.abilities.clear();
  }

  async createProfile(
    userId: string,
    input: CreateGameProfilePayload,
  ): Promise<GameProfileRecord> {
    const parsed = createGameProfileSchema.parse(input);
    const existing = [...this.profiles.values()].find(
      (p) => p.user_id === userId && !p.deleted_at && p.slug === parsed.slug,
    );
    if (existing) {
      throw new Error(`Game profile slug "${parsed.slug}" already exists`);
    }
    const timestamp = nowIso();
    const record: GameProfileRecord = {
      id: randomUUID(),
      user_id: userId,
      slug: parsed.slug,
      name: parsed.name,
      description: parsed.description ?? '',
      terminology: { ...(parsed.terminology ?? {}) },
      gameplay_rules: parsed.gameplay_rules ?? '',
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    };
    this.profiles.set(record.id, record);
    return structuredClone(record);
  }

  async getProfile(userId: string, profileId: string): Promise<GameProfileRecord | null> {
    const profile = this.profiles.get(profileId);
    if (!profile || profile.user_id !== userId || profile.deleted_at) return null;
    return structuredClone(profile);
  }

  async getProfileBySlug(userId: string, slug: string): Promise<GameProfileRecord | null> {
    const profile = [...this.profiles.values()].find(
      (p) => p.user_id === userId && !p.deleted_at && p.slug === slug,
    );
    return profile ? structuredClone(profile) : null;
  }

  async listProfiles(userId: string): Promise<GameProfileRecord[]> {
    return [...this.profiles.values()]
      .filter((p) => p.user_id === userId && !p.deleted_at)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => structuredClone(p));
  }

  async updateProfile(
    userId: string,
    profileId: string,
    input: UpdateGameProfilePayload,
  ): Promise<GameProfileRecord> {
    const existing = await this.getProfile(userId, profileId);
    if (!existing) throw new Error('Game profile not found');
    const parsed = updateGameProfileSchema.parse(input);
    const updated: GameProfileRecord = {
      ...existing,
      name: parsed.name ?? existing.name,
      description: parsed.description ?? existing.description,
      terminology: parsed.terminology
        ? { ...parsed.terminology }
        : existing.terminology,
      gameplay_rules: parsed.gameplay_rules ?? existing.gameplay_rules,
      updated_at: nowIso(),
    };
    this.profiles.set(profileId, updated);
    return structuredClone(updated);
  }

  private async requireProfile(userId: string, profileId: string): Promise<GameProfileRecord> {
    const profile = await this.getProfile(userId, profileId);
    if (!profile) throw new Error('Game profile not found');
    return profile;
  }

  async upsertServerProfile(
    userId: string,
    gameProfileId: string,
    input: UpsertGameServerProfilePayload,
  ): Promise<GameServerProfileRecord> {
    await this.requireProfile(userId, gameProfileId);
    const parsed = upsertGameServerProfileSchema.parse(input);
    const existing = [...this.serverProfiles.values()].find(
      (s) => s.game_profile_id === gameProfileId && s.environment === parsed.environment,
    );
    const timestamp = nowIso();
    if (existing) {
      const updated: GameServerProfileRecord = {
        ...existing,
        terminology: { ...(parsed.terminology ?? {}) },
        recognition_config: { ...(parsed.recognition_config ?? {}) },
        notes: parsed.notes ?? '',
        updated_at: timestamp,
      };
      this.serverProfiles.set(existing.id, updated);
      return structuredClone(updated);
    }
    const record: GameServerProfileRecord = {
      id: randomUUID(),
      game_profile_id: gameProfileId,
      environment: parsed.environment,
      terminology: { ...(parsed.terminology ?? {}) },
      recognition_config: { ...(parsed.recognition_config ?? {}) },
      notes: parsed.notes ?? '',
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.serverProfiles.set(record.id, record);
    return structuredClone(record);
  }

  async getServerProfile(
    userId: string,
    gameProfileId: string,
    environment: GameServerEnvironment,
  ): Promise<GameServerProfileRecord | null> {
    await this.requireProfile(userId, gameProfileId);
    const record = [...this.serverProfiles.values()].find(
      (s) => s.game_profile_id === gameProfileId && s.environment === environment,
    );
    return record ? structuredClone(record) : null;
  }

  async createPatch(
    userId: string,
    gameProfileId: string,
    input: CreateGamePatchPayload,
  ): Promise<GamePatchRecord> {
    await this.requireProfile(userId, gameProfileId);
    const parsed = createGamePatchSchema.parse(input);
    const duplicate = [...this.patches.values()].find(
      (p) =>
        p.game_profile_id === gameProfileId &&
        p.server_environment === parsed.server_environment &&
        p.patch_code === parsed.patch_code,
    );
    if (duplicate) {
      throw new Error(
        `Patch code "${parsed.patch_code}" already exists for ${parsed.server_environment}`,
      );
    }
    if (parsed.previous_patch_id) {
      const previous = await this.getPatch(userId, parsed.previous_patch_id);
      if (!previous || previous.game_profile_id !== gameProfileId) {
        throw new Error('previous_patch_id not found for this game profile');
      }
      if (previous.server_environment !== parsed.server_environment) {
        throw new GameKnowledgeActivationError(
          'ENVIRONMENT_MISMATCH',
          'previous_patch_id must share the same server environment',
        );
      }
    }
    const timestamp = nowIso();
    const record: GamePatchRecord = {
      id: randomUUID(),
      game_profile_id: gameProfileId,
      server_environment: parsed.server_environment,
      patch_code: parsed.patch_code,
      title: parsed.title,
      effective_from: parsed.effective_from ?? null,
      effective_to: parsed.effective_to ?? null,
      status: 'draft',
      notes: parsed.notes ?? '',
      previous_patch_id: parsed.previous_patch_id ?? null,
      published_at: null,
      published_by: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.patches.set(record.id, record);
    return structuredClone(record);
  }

  async getPatch(userId: string, patchId: string): Promise<GamePatchRecord | null> {
    const patch = this.patches.get(patchId);
    if (!patch) return null;
    const profile = await this.getProfile(userId, patch.game_profile_id);
    if (!profile) return null;
    return structuredClone(patch);
  }

  async listPatches(
    userId: string,
    gameProfileId: string,
    environment?: GameServerEnvironment,
  ): Promise<GamePatchRecord[]> {
    await this.requireProfile(userId, gameProfileId);
    return [...this.patches.values()]
      .filter(
        (p) =>
          p.game_profile_id === gameProfileId &&
          (environment ? p.server_environment === environment : true),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => structuredClone(p));
  }

  async updateDraftPatch(
    userId: string,
    patchId: string,
    input: UpdateGamePatchDraftPayload,
  ): Promise<GamePatchRecord> {
    const existing = await this.getPatch(userId, patchId);
    if (!existing) throw new Error('Game patch not found');
    assertPatchMutable(existing);
    const parsed = updateGamePatchDraftSchema.parse(input);
    const updated: GamePatchRecord = {
      ...existing,
      title: parsed.title ?? existing.title,
      effective_from:
        parsed.effective_from !== undefined ? parsed.effective_from : existing.effective_from,
      effective_to:
        parsed.effective_to !== undefined ? parsed.effective_to : existing.effective_to,
      notes: parsed.notes ?? existing.notes,
      previous_patch_id:
        parsed.previous_patch_id !== undefined
          ? parsed.previous_patch_id
          : existing.previous_patch_id,
      updated_at: nowIso(),
    };
    this.patches.set(patchId, updated);
    return structuredClone(updated);
  }

  async publishPatch(userId: string, patchId: string): Promise<GamePatchRecord> {
    const existing = await this.getPatch(userId, patchId);
    if (!existing) throw new Error('Game patch not found');
    if (existing.status === 'published') {
      return structuredClone(existing);
    }
    if (existing.status === 'archived') {
      throw new GameKnowledgeActivationError(
        'PATCH_IMMUTABLE',
        `Archived patch "${existing.patch_code}" cannot be published`,
      );
    }
    const updated: GamePatchRecord = {
      ...existing,
      status: 'published',
      published_at: nowIso(),
      published_by: userId,
      updated_at: nowIso(),
    };
    this.patches.set(patchId, updated);
    return structuredClone(updated);
  }

  async archivePatch(userId: string, patchId: string): Promise<GamePatchRecord> {
    const existing = await this.getPatch(userId, patchId);
    if (!existing) throw new Error('Game patch not found');
    if (existing.status === 'draft') {
      throw new GameKnowledgeActivationError(
        'PATCH_NOT_PUBLISHED',
        'Archive applies to published patches; delete or leave draft unpublished instead',
      );
    }
    const updated: GamePatchRecord = {
      ...existing,
      status: 'archived',
      updated_at: nowIso(),
    };
    this.patches.set(patchId, updated);
    return structuredClone(updated);
  }

  private async requireDraftPatch(userId: string, patchId: string): Promise<GamePatchRecord> {
    const patch = await this.getPatch(userId, patchId);
    if (!patch) throw new Error('Game patch not found');
    assertPatchMutable(patch);
    return patch;
  }

  async addKnowledgeSource(
    userId: string,
    patchId: string,
    input: CreateKnowledgeSourcePayload,
  ): Promise<KnowledgeSourceRecord> {
    await this.requireDraftPatch(userId, patchId);
    const parsed = createKnowledgeSourceSchema.parse(input);
    const record: KnowledgeSourceRecord = {
      id: randomUUID(),
      game_patch_id: patchId,
      source_type: parsed.source_type,
      title: parsed.title,
      url: parsed.url ?? null,
      published_at: parsed.published_at ?? null,
      retrieved_at: parsed.retrieved_at ?? null,
      checksum_sha256: parsed.checksum_sha256 ?? null,
      notes: parsed.notes ?? '',
      created_at: nowIso(),
    };
    this.sources.set(record.id, record);
    return structuredClone(record);
  }

  async listKnowledgeSources(
    userId: string,
    patchId: string,
  ): Promise<KnowledgeSourceRecord[]> {
    const patch = await this.getPatch(userId, patchId);
    if (!patch) throw new Error('Game patch not found');
    return [...this.sources.values()]
      .filter((s) => s.game_patch_id === patchId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((s) => structuredClone(s));
  }

  async upsertHero(
    userId: string,
    patchId: string,
    input: CreateHeroKnowledgePayload,
  ): Promise<HeroKnowledgeRecord> {
    await this.requireDraftPatch(userId, patchId);
    const parsed = createHeroKnowledgeSchema.parse(input);
    const existing = [...this.heroes.values()].find(
      (h) => h.game_patch_id === patchId && h.hero_key === parsed.hero_key,
    );
    const timestamp = nowIso();
    if (existing) {
      const updated: HeroKnowledgeRecord = {
        ...existing,
        name: parsed.name,
        aliases: asStringArray(parsed.aliases),
        roles: asStringArray(parsed.roles),
        lanes: asStringArray(parsed.lanes),
        description: parsed.description ?? '',
        passive: { ...(parsed.passive ?? {}) },
        damage_types: asStringArray(parsed.damage_types),
        cc_types: asStringArray(parsed.cc_types),
        sound_signature_notes: parsed.sound_signature_notes ?? '',
        revamp_notes: parsed.revamp_notes ?? '',
        portrait_asset_id: parsed.portrait_asset_id ?? existing.portrait_asset_id,
        updated_at: timestamp,
      };
      this.heroes.set(existing.id, updated);
      return structuredClone(updated);
    }
    const record: HeroKnowledgeRecord = {
      id: randomUUID(),
      game_patch_id: patchId,
      hero_key: parsed.hero_key,
      name: parsed.name,
      aliases: asStringArray(parsed.aliases),
      roles: asStringArray(parsed.roles),
      lanes: asStringArray(parsed.lanes),
      description: parsed.description ?? '',
      passive: { ...(parsed.passive ?? {}) },
      damage_types: asStringArray(parsed.damage_types),
      cc_types: asStringArray(parsed.cc_types),
      sound_signature_notes: parsed.sound_signature_notes ?? '',
      revamp_notes: parsed.revamp_notes ?? '',
      portrait_asset_id: parsed.portrait_asset_id ?? null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.heroes.set(record.id, record);
    return structuredClone(record);
  }

  async updateHero(
    userId: string,
    heroId: string,
    input: UpdateHeroKnowledgePayload,
  ): Promise<HeroKnowledgeRecord> {
    const existing = await this.getHero(userId, heroId);
    if (!existing) throw new Error('Hero knowledge not found');
    await this.requireDraftPatch(userId, existing.game_patch_id);
    const parsed = updateHeroKnowledgeSchema.parse(input);
    const updated: HeroKnowledgeRecord = {
      ...existing,
      name: parsed.name ?? existing.name,
      aliases: parsed.aliases ? asStringArray(parsed.aliases) : existing.aliases ?? [],
      roles: parsed.roles ? asStringArray(parsed.roles) : existing.roles,
      lanes: parsed.lanes ? asStringArray(parsed.lanes) : existing.lanes,
      description: parsed.description ?? existing.description,
      passive: parsed.passive ? { ...parsed.passive } : existing.passive,
      damage_types: parsed.damage_types
        ? asStringArray(parsed.damage_types)
        : existing.damage_types,
      cc_types: parsed.cc_types ? asStringArray(parsed.cc_types) : existing.cc_types,
      sound_signature_notes:
        parsed.sound_signature_notes ?? existing.sound_signature_notes,
      revamp_notes: parsed.revamp_notes ?? existing.revamp_notes,
      portrait_asset_id:
        parsed.portrait_asset_id !== undefined
          ? parsed.portrait_asset_id
          : existing.portrait_asset_id,
      updated_at: nowIso(),
    };
    this.heroes.set(heroId, updated);
    return structuredClone(updated);
  }

  async listHeroes(userId: string, patchId: string): Promise<HeroKnowledgeRecord[]> {
    const patch = await this.getPatch(userId, patchId);
    if (!patch) throw new Error('Game patch not found');
    return [...this.heroes.values()]
      .filter((h) => h.game_patch_id === patchId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((h) => structuredClone(h));
  }

  async getHero(userId: string, heroId: string): Promise<HeroKnowledgeRecord | null> {
    const hero = this.heroes.get(heroId);
    if (!hero) return null;
    const patch = await this.getPatch(userId, hero.game_patch_id);
    if (!patch) return null;
    return structuredClone(hero);
  }

  private async requireHero(userId: string, heroId: string): Promise<HeroKnowledgeRecord> {
    const hero = await this.getHero(userId, heroId);
    if (!hero) throw new Error('Hero knowledge not found');
    return hero;
  }

  async upsertAbility(
    userId: string,
    heroId: string,
    input: CreateAbilityKnowledgePayload,
  ): Promise<AbilityKnowledgeRecord> {
    const hero = await this.requireHero(userId, heroId);
    await this.requireDraftPatch(userId, hero.game_patch_id);
    const parsed = createAbilityKnowledgeSchema.parse(input);
    const existing = [...this.abilities.values()].find(
      (a) => a.hero_knowledge_id === heroId && a.ability_key === parsed.ability_key,
    );
    const timestamp = nowIso();
    if (existing) {
      const updated: AbilityKnowledgeRecord = {
        ...existing,
        slot: parsed.slot,
        name: parsed.name,
        description: parsed.description ?? '',
        effects: parsed.effects ?? '',
        damage_types: asStringArray(parsed.damage_types),
        cc_types: asStringArray(parsed.cc_types),
        experimental: Boolean(parsed.experimental),
        updated_at: timestamp,
      };
      this.abilities.set(existing.id, updated);
      return structuredClone(updated);
    }
    const record: AbilityKnowledgeRecord = {
      id: randomUUID(),
      hero_knowledge_id: heroId,
      ability_key: parsed.ability_key,
      slot: parsed.slot,
      name: parsed.name,
      description: parsed.description ?? '',
      effects: parsed.effects ?? '',
      damage_types: asStringArray(parsed.damage_types),
      cc_types: asStringArray(parsed.cc_types),
      experimental: Boolean(parsed.experimental),
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.abilities.set(record.id, record);
    return structuredClone(record);
  }

  async updateAbility(
    userId: string,
    abilityId: string,
    input: UpdateAbilityKnowledgePayload,
  ): Promise<AbilityKnowledgeRecord> {
    const existing = this.abilities.get(abilityId);
    if (!existing) throw new Error('Ability knowledge not found');
    const hero = await this.requireHero(userId, existing.hero_knowledge_id);
    await this.requireDraftPatch(userId, hero.game_patch_id);
    const parsed = updateAbilityKnowledgeSchema.parse(input);
    const updated: AbilityKnowledgeRecord = {
      ...existing,
      slot: parsed.slot ?? existing.slot,
      name: parsed.name ?? existing.name,
      description: parsed.description ?? existing.description,
      effects: parsed.effects ?? existing.effects,
      damage_types: parsed.damage_types
        ? asStringArray(parsed.damage_types)
        : existing.damage_types,
      cc_types: parsed.cc_types ? asStringArray(parsed.cc_types) : existing.cc_types,
      experimental:
        parsed.experimental !== undefined ? Boolean(parsed.experimental) : existing.experimental,
      updated_at: nowIso(),
    };
    this.abilities.set(abilityId, updated);
    return structuredClone(updated);
  }

  async listAbilities(
    userId: string,
    heroId: string,
  ): Promise<AbilityKnowledgeRecord[]> {
    await this.requireHero(userId, heroId);
    return [...this.abilities.values()]
      .filter((a) => a.hero_knowledge_id === heroId)
      .sort((a, b) => a.ability_key.localeCompare(b.ability_key))
      .map((a) => structuredClone(a));
  }

  async activateOnProject(
    userId: string,
    projectId: string,
    input: ActivateProjectGameKnowledgePayload,
  ): Promise<ProjectGameKnowledgeBinding> {
    const parsed = activateProjectGameKnowledgeSchema.parse(input);
    const project = await this.projects.getById(userId, projectId);
    if (!project) throw new Error('Project not found');
    await this.requireProfile(userId, parsed.game_profile_id);
    const patch = await this.getPatch(userId, parsed.game_patch_id);
    if (!patch) throw new Error('Game patch not found');

    assertCanActivatePatch({
      requestedEnvironment: parsed.server_environment,
      gameProfileId: parsed.game_profile_id,
      patch,
    });

    await this.projects.setGameKnowledgeBinding(userId, projectId, {
      game_profile_id: parsed.game_profile_id,
      game_server_environment: parsed.server_environment,
      active_game_patch_id: parsed.game_patch_id,
    });

    return {
      game_profile_id: parsed.game_profile_id,
      server_environment: parsed.server_environment,
      active_game_patch_id: parsed.game_patch_id,
    };
  }

  async bindOnVideo(
    userId: string,
    videoId: string,
    input: BindVideoGameKnowledgePayload,
  ): Promise<VideoGameKnowledgeBinding> {
    const parsed = bindVideoGameKnowledgeSchema.parse(input);
    const video = await this.videos.getById(userId, videoId);
    if (!video) throw new Error('Video not found');
    const patch = await this.getPatch(userId, parsed.game_patch_id);
    if (!patch) throw new Error('Game patch not found');

    assertCanActivatePatch({
      requestedEnvironment: parsed.server_environment,
      gameProfileId: patch.game_profile_id,
      patch,
    });

    await this.videos.setGameKnowledgeBinding(userId, videoId, {
      game_server_environment: parsed.server_environment,
      game_patch_id: parsed.game_patch_id,
    });

    return {
      server_environment: parsed.server_environment,
      game_patch_id: parsed.game_patch_id,
    };
  }

  async resolveActivatedKnowledge(
    userId: string,
    input: { server_environment: GameServerEnvironment; game_patch_id: string },
  ): Promise<ActivatedGameKnowledge> {
    const patch = await this.getPatch(userId, input.game_patch_id);
    if (!patch) throw new Error('Game patch not found');
    assertCanActivatePatch({
      requestedEnvironment: input.server_environment,
      gameProfileId: patch.game_profile_id,
      patch,
    });

    const gameProfile = await this.requireProfile(userId, patch.game_profile_id);
    const serverProfile = await this.getServerProfile(
      userId,
      patch.game_profile_id,
      input.server_environment,
    );
    const sources = await this.listKnowledgeSources(userId, patch.id);
    const heroes = await this.listHeroes(userId, patch.id);
    const heroesWithAbilities = [];
    for (const hero of heroes) {
      const abilities = await this.listAbilities(userId, hero.id);
      const filtered = filterAbilitiesForEnvironment(input.server_environment, abilities);
      assertNoExperimentalLeak(input.server_environment, filtered);
      heroesWithAbilities.push({ ...hero, abilities: filtered });
    }

    return {
      game_profile: gameProfile,
      server_environment: input.server_environment,
      patch,
      server_profile: serverProfile,
      heroes: heroesWithAbilities,
      sources,
    };
  }

  async clearDraftPatchContent(userId: string, patchId: string): Promise<void> {
    await this.requireDraftPatch(userId, patchId);
    const heroIds = [...this.heroes.values()]
      .filter((h) => h.game_patch_id === patchId)
      .map((h) => h.id);
    for (const heroId of heroIds) {
      for (const [abilityId, ability] of this.abilities) {
        if (ability.hero_knowledge_id === heroId) this.abilities.delete(abilityId);
      }
      this.heroes.delete(heroId);
    }
    for (const [sourceId, source] of this.sources) {
      if (source.game_patch_id === patchId) this.sources.delete(sourceId);
    }
  }

  exportAll(): {
    profiles: GameProfileRecord[];
    serverProfiles: GameServerProfileRecord[];
    patches: GamePatchRecord[];
    sources: KnowledgeSourceRecord[];
    heroes: HeroKnowledgeRecord[];
    abilities: AbilityKnowledgeRecord[];
  } {
    return {
      profiles: [...this.profiles.values()].map((r) => structuredClone(r)),
      serverProfiles: [...this.serverProfiles.values()].map((r) => structuredClone(r)),
      patches: [...this.patches.values()].map((r) => structuredClone(r)),
      sources: [...this.sources.values()].map((r) => structuredClone(r)),
      heroes: [...this.heroes.values()].map((r) => structuredClone(r)),
      abilities: [...this.abilities.values()].map((r) => structuredClone(r)),
    };
  }

  importAll(snapshot: {
    profiles?: GameProfileRecord[];
    serverProfiles?: GameServerProfileRecord[];
    patches?: GamePatchRecord[];
    sources?: KnowledgeSourceRecord[];
    heroes?: HeroKnowledgeRecord[];
    abilities?: AbilityKnowledgeRecord[];
  }): void {
    this.clear();
    for (const record of snapshot.profiles ?? []) this.profiles.set(record.id, structuredClone(record));
    for (const record of snapshot.serverProfiles ?? []) {
      this.serverProfiles.set(record.id, structuredClone(record));
    }
    for (const record of snapshot.patches ?? []) this.patches.set(record.id, structuredClone(record));
    for (const record of snapshot.sources ?? []) this.sources.set(record.id, structuredClone(record));
    for (const record of snapshot.heroes ?? []) this.heroes.set(record.id, structuredClone(record));
    for (const record of snapshot.abilities ?? []) {
      this.abilities.set(record.id, structuredClone(record));
    }
  }
}
