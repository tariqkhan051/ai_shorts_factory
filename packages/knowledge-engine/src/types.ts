import type {
  GameServerEnvironment,
  KnowledgeSyncJobKind,
  KnowledgeSyncJobStatus,
  KnowledgeVerificationStatus,
} from '@ai-shorts-factory/shared-types';

export type ServerType = GameServerEnvironment;

export type ProvenanceFields = {
  server_type: ServerType;
  source: string;
  source_url: string | null;
  source_published_at: string | null;
  first_discovered_at: string;
  last_verified_at: string | null;
  patch_version: string;
  confidence_score: number;
  verification_status: KnowledgeVerificationStatus;
  record_version: number;
  content_sha256: string | null;
  evidence_text: string;
  unknown_fields: string[];
};

export type MonitoredSource = {
  id: string;
  source_key: string;
  display_name: string;
  source_type: string;
  base_url: string;
  discovery_method: string;
  server_type: ServerType | null;
  enabled: boolean;
  is_community: boolean;
  respect_robots: boolean;
  rate_limit_ms: number;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
};

export type KnowledgeSyncJob = {
  id: string;
  user_id: string;
  kind: KnowledgeSyncJobKind;
  status: KnowledgeSyncJobStatus;
  server_type: ServerType | null;
  lock_owner: string | null;
  lock_expires_at: string | null;
  attempt: number;
  max_attempts: number;
  scheduled_at: string;
  started_at: string | null;
  finished_at: string | null;
  next_retry_at: string | null;
  idempotency_key: string;
  input_json: Record<string, unknown>;
  result_json: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeSyncLog = {
  id: string;
  job_id: string;
  user_id: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type KnowledgeItemRecord = ProvenanceFields & {
  id: string;
  user_id: string;
  game_profile_id: string;
  item_key: string;
  name: string;
  category: string;
  cost: number | null;
  attributes: Record<string, unknown>;
  passive_effects: string;
  active_effects: string;
  combinations: unknown[];
};

export type KnowledgeEmblemRecord = ProvenanceFields & {
  id: string;
  user_id: string;
  game_profile_id: string;
  emblem_key: string;
  name: string;
  talents: unknown[];
};

export type KnowledgeBattleSpellRecord = ProvenanceFields & {
  id: string;
  user_id: string;
  game_profile_id: string;
  spell_key: string;
  name: string;
  cooldown_seconds: number | null;
  effects: string;
  usage_notes: string;
};

export type KnowledgeMapRecord = ProvenanceFields & {
  id: string;
  user_id: string;
  game_profile_id: string;
  map_key: string;
  name: string;
  lanes: unknown[];
  jungle_areas: unknown[];
  objective_mechanics: Record<string, unknown>;
  terminology: Record<string, string>;
};

export type KnowledgeMonsterRecord = ProvenanceFields & {
  id: string;
  user_id: string;
  game_profile_id: string;
  monster_key: string;
  name: string;
  monster_kind: string;
  mechanics: string;
};

export type KnowledgePatchExtRecord = {
  id: string;
  user_id: string;
  game_profile_id: string;
  game_patch_id: string | null;
  server_type: ServerType;
  patch_identifier: string;
  release_date: string | null;
  summary_json: Record<string, unknown>;
  new_heroes: unknown[];
  hero_buffs: unknown[];
  hero_nerfs: unknown[];
  item_changes: unknown[];
  gameplay_changes: unknown[];
  strategic_implications: string;
  sources: unknown[];
  content_sha256: string | null;
  related_advance_patch_id: string | null;
  related_original_patch_id: string | null;
  first_discovered_at: string;
  last_verified_at: string | null;
  confidence_score: number;
  verification_status: KnowledgeVerificationStatus;
  record_version: number;
};

export type KnowledgeStrategyRecord = ProvenanceFields & {
  id: string;
  user_id: string;
  game_profile_id: string;
  strategy_key: string;
  title: string;
  category: string;
  body: string;
  hero_keys: string[];
  is_community: boolean;
};

export type KnowledgeEsportsRecord = {
  id: string;
  user_id: string;
  game_profile_id: string;
  server_type: ServerType;
  record_key: string;
  title: string;
  category: string;
  body_json: Record<string, unknown>;
  source: string;
  source_url: string | null;
  source_published_at: string | null;
  first_discovered_at: string;
  last_verified_at: string | null;
  confidence_score: number;
  verification_status: KnowledgeVerificationStatus;
  record_version: number;
  content_sha256: string | null;
  evidence_text: string;
};

export type KnowledgeVersionRecord = {
  id: string;
  user_id: string;
  entity_table: string;
  entity_id: string;
  record_version: number;
  snapshot_json: Record<string, unknown>;
  change_summary: string;
  content_sha256: string | null;
  created_at: string;
};

export type KnowledgeEngineState = {
  user_id: string;
  activated: boolean;
  scheduler_config: KnowledgeSchedulerConfig;
  last_sync_at: string | null;
  next_sync_at: string | null;
  last_initial_ingestion_at: string | null;
  stats_json: KnowledgeEngineStats;
  updated_at: string;
};

export type KnowledgeSchedulerConfig = {
  patch_monitor_hours: number;
  official_verify_hours: number;
  community_meta_refresh_hours: number;
  consistency_audit_hours: number;
  min_request_interval_ms: number;
  max_retries: number;
  lock_ttl_seconds: number;
  enabled: boolean;
};

export type KnowledgeEngineStats = {
  heroes_discovered: number;
  heroes_synchronized: number;
  items: number;
  emblems: number;
  battle_spells: number;
  patches: number;
  strategies: number;
  esports: number;
  original_status: string;
  advance_status: string;
  pending_validation: number;
  failed_jobs: number;
  sources_monitored: number;
  recently_discovered_changes: number;
};

export type ExtractedHero = {
  hero_key: string;
  name: string;
  aliases: string[];
  roles: string[];
  lanes: string[];
  description: string;
  passive: Record<string, unknown>;
  damage_types: string[];
  cc_types: string[];
  difficulty: string | null;
  release_info: string | null;
  abilities: Array<{
    ability_key: string;
    slot: 'passive' | 'skill1' | 'skill2' | 'ultimate' | 'other';
    name: string;
    description: string;
    effects: string;
    damage_types: string[];
    cc_types: string[];
    experimental: boolean;
    cooldown: string | null;
  }>;
  unknown_fields: string[];
  evidence_text: string;
  source_url: string;
  confidence_score: number;
};

export type DiscoveredDocument = {
  source_key: string;
  url: string;
  title: string;
  server_type: ServerType | null;
  content_type: string;
  retrieved_at: string;
  content_sha256: string;
  raw_text: string;
  is_community: boolean;
  metadata: Record<string, unknown>;
};

export type PatchSummary = {
  patch_identifier: string;
  server_type: ServerType;
  release_date: string | null;
  new_heroes: string[];
  hero_buffs: string[];
  hero_nerfs: string[];
  item_changes: string[];
  gameplay_changes: string[];
  strategic_implications: string;
  sources: Array<{ title: string; url: string | null }>;
  content_sha256: string;
};

export type MatchKnowledgeContextPackage = {
  server_type: ServerType;
  patch_code: string | null;
  patch_resolution: 'bound' | 'unknown' | 'draft_only';
  heroes: Array<{
    hero_key: string;
    name: string;
    roles: string[];
    lanes: string[];
    abilities: Array<{
      ability_key: string;
      slot: string;
      name: string;
      description: string;
      experimental: boolean;
    }>;
    verification_status: string;
    confidence_score: number;
    source: string;
  }>;
  relevant_patch_changes: Array<{
    change_kind: string;
    target_key: string;
    summary: string;
  }>;
  items: Array<{ item_key: string; name: string; category: string; cost: number | null }>;
  strategies: Array<{ strategy_key: string; title: string; body: string; is_community: boolean }>;
  grounding_rules: string[];
};

export type IngestionRunResult = {
  job_id: string;
  kind: KnowledgeSyncJobKind;
  status: KnowledgeSyncJobStatus;
  heroes_upserted: number;
  items_upserted: number;
  patches_detected: number;
  duplicates_skipped: number;
  validation_failures: number;
  draft_patch_id: string | null;
  errors: string[];
  limitations: string[];
};
