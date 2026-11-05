import type {
  GamePatchStatus,
  GameServerEnvironment,
  HeroAbilitySlot,
  KnowledgeSourceType,
} from '@ai-shorts-factory/shared-types';
import type {
  ActivateProjectGameKnowledgePayload,
  BindVideoGameKnowledgePayload,
  CreateAbilityKnowledgePayload,
  CreateGamePatchPayload,
  CreateGameProfilePayload,
  CreateHeroKnowledgePayload,
  CreateKnowledgeSourcePayload,
  UpdateAbilityKnowledgePayload,
  UpdateGamePatchDraftPayload,
  UpdateGameProfilePayload,
  UpdateHeroKnowledgePayload,
  UpsertGameServerProfilePayload,
} from '@ai-shorts-factory/validation';

export type GameProfileRecord = {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  description: string;
  terminology: Record<string, string>;
  gameplay_rules: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type GameServerProfileRecord = {
  id: string;
  game_profile_id: string;
  environment: GameServerEnvironment;
  terminology: Record<string, string>;
  recognition_config: Record<string, unknown>;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type GamePatchRecord = {
  id: string;
  game_profile_id: string;
  server_environment: GameServerEnvironment;
  patch_code: string;
  title: string;
  effective_from: string | null;
  effective_to: string | null;
  status: GamePatchStatus;
  notes: string;
  previous_patch_id: string | null;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeSourceRecord = {
  id: string;
  game_patch_id: string;
  source_type: KnowledgeSourceType;
  title: string;
  url: string | null;
  published_at: string | null;
  retrieved_at: string | null;
  checksum_sha256: string | null;
  notes: string;
  created_at: string;
};

export type HeroKnowledgeRecord = {
  id: string;
  game_patch_id: string;
  hero_key: string;
  name: string;
  /** Alternate spellings / OCR aliases (Match Studio M4). */
  aliases: string[];
  roles: string[];
  lanes: string[];
  description: string;
  passive: Record<string, unknown>;
  damage_types: string[];
  cc_types: string[];
  sound_signature_notes: string;
  revamp_notes: string;
  portrait_asset_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AbilityKnowledgeRecord = {
  id: string;
  hero_knowledge_id: string;
  ability_key: string;
  slot: HeroAbilitySlot;
  name: string;
  description: string;
  effects: string;
  damage_types: string[];
  cc_types: string[];
  experimental: boolean;
  created_at: string;
  updated_at: string;
};

/** Resolved, environment-safe knowledge snapshot for commentary / analysis. */
export type ActivatedGameKnowledge = {
  game_profile: GameProfileRecord;
  server_environment: GameServerEnvironment;
  patch: GamePatchRecord;
  server_profile: GameServerProfileRecord | null;
  heroes: Array<HeroKnowledgeRecord & { abilities: AbilityKnowledgeRecord[] }>;
  sources: KnowledgeSourceRecord[];
};

export type ProjectGameKnowledgeBinding = {
  game_profile_id: string;
  server_environment: GameServerEnvironment;
  active_game_patch_id: string;
};

export type VideoGameKnowledgeBinding = {
  server_environment: GameServerEnvironment;
  game_patch_id: string;
};

export interface GameKnowledgeRepository {
  createProfile(userId: string, input: CreateGameProfilePayload): Promise<GameProfileRecord>;
  getProfile(userId: string, profileId: string): Promise<GameProfileRecord | null>;
  getProfileBySlug(userId: string, slug: string): Promise<GameProfileRecord | null>;
  listProfiles(userId: string): Promise<GameProfileRecord[]>;
  updateProfile(
    userId: string,
    profileId: string,
    input: UpdateGameProfilePayload,
  ): Promise<GameProfileRecord>;

  upsertServerProfile(
    userId: string,
    gameProfileId: string,
    input: UpsertGameServerProfilePayload,
  ): Promise<GameServerProfileRecord>;
  getServerProfile(
    userId: string,
    gameProfileId: string,
    environment: GameServerEnvironment,
  ): Promise<GameServerProfileRecord | null>;

  createPatch(
    userId: string,
    gameProfileId: string,
    input: CreateGamePatchPayload,
  ): Promise<GamePatchRecord>;
  getPatch(userId: string, patchId: string): Promise<GamePatchRecord | null>;
  listPatches(
    userId: string,
    gameProfileId: string,
    environment?: GameServerEnvironment,
  ): Promise<GamePatchRecord[]>;
  updateDraftPatch(
    userId: string,
    patchId: string,
    input: UpdateGamePatchDraftPayload,
  ): Promise<GamePatchRecord>;
  /** draft → published; thereafter content is immutable. */
  publishPatch(userId: string, patchId: string): Promise<GamePatchRecord>;
  archivePatch(userId: string, patchId: string): Promise<GamePatchRecord>;

  addKnowledgeSource(
    userId: string,
    patchId: string,
    input: CreateKnowledgeSourcePayload,
  ): Promise<KnowledgeSourceRecord>;
  listKnowledgeSources(userId: string, patchId: string): Promise<KnowledgeSourceRecord[]>;

  upsertHero(
    userId: string,
    patchId: string,
    input: CreateHeroKnowledgePayload,
  ): Promise<HeroKnowledgeRecord>;
  updateHero(
    userId: string,
    heroId: string,
    input: UpdateHeroKnowledgePayload,
  ): Promise<HeroKnowledgeRecord>;
  listHeroes(userId: string, patchId: string): Promise<HeroKnowledgeRecord[]>;
  getHero(userId: string, heroId: string): Promise<HeroKnowledgeRecord | null>;

  upsertAbility(
    userId: string,
    heroId: string,
    input: CreateAbilityKnowledgePayload,
  ): Promise<AbilityKnowledgeRecord>;
  updateAbility(
    userId: string,
    abilityId: string,
    input: UpdateAbilityKnowledgePayload,
  ): Promise<AbilityKnowledgeRecord>;
  listAbilities(userId: string, heroId: string): Promise<AbilityKnowledgeRecord[]>;

  /**
   * Activate a published patch on a project.
   * Rejects draft/archived patches and environment mismatches.
   */
  activateOnProject(
    userId: string,
    projectId: string,
    input: ActivateProjectGameKnowledgePayload,
  ): Promise<ProjectGameKnowledgeBinding>;

  /**
   * Bind a published patch to a video/match.
   * Rejects Advance patches on Original bindings (and vice versa).
   */
  bindOnVideo(
    userId: string,
    videoId: string,
    input: BindVideoGameKnowledgePayload,
  ): Promise<VideoGameKnowledgeBinding>;

  /**
   * Resolve published knowledge for a pinned environment + patch.
   * Hard-fails on environment mismatch, draft patches, or experimental abilities
   * when environment is original.
   */
  resolveActivatedKnowledge(
    userId: string,
    input: { server_environment: GameServerEnvironment; game_patch_id: string },
  ): Promise<ActivatedGameKnowledge>;

  /**
   * Wipe heroes/abilities/sources on a draft patch before re-import.
   * Published/archived patches are rejected.
   */
  clearDraftPatchContent(userId: string, patchId: string): Promise<void>;
}
