/** MLBB / game-intelligence domain enums (Milestone 1). */

export const GAME_SERVER_ENVIRONMENTS = ['original', 'advance'] as const;
export type GameServerEnvironment = (typeof GAME_SERVER_ENVIRONMENTS)[number];

export const GAME_PATCH_STATUSES = ['draft', 'published', 'archived'] as const;
export type GamePatchStatus = (typeof GAME_PATCH_STATUSES)[number];

export const HERO_ABILITY_SLOTS = [
  'passive',
  'skill1',
  'skill2',
  'ultimate',
  'other',
] as const;
export type HeroAbilitySlot = (typeof HERO_ABILITY_SLOTS)[number];

export const KNOWLEDGE_SOURCE_TYPES = [
  'official_patch_notes',
  'official_hero_page',
  'research_report',
  'manual_entry',
  'other',
] as const;
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

/** Human-readable labels for operator UI. */
export const GAME_SERVER_ENVIRONMENT_LABELS: Record<GameServerEnvironment, string> = {
  original: 'Original Server',
  advance: 'Advance Server',
};

/** Exact phrase required to publish draft game knowledge (Milestone 2). */
export const PUBLISH_GAME_KNOWLEDGE_PHRASE = 'PUBLISH_GAME_KNOWLEDGE' as const;

/** Milestone 3 — match analysis job lifecycle. */
export const MATCH_ANALYSIS_STATUSES = [
  'pending',
  'sampling',
  'ocr',
  'mapping',
  'completed',
  'failed',
  'cached',
] as const;
export type MatchAnalysisStatus = (typeof MATCH_ANALYSIS_STATUSES)[number];

export const MATCH_HUD_REGION_IDS = [
  'loading_roster',
  'scoreboard',
  'kill_feed',
  'minimap',
  'custom',
] as const;
export type MatchHudRegionId = (typeof MATCH_HUD_REGION_IDS)[number];

/** Milestone 4 — gameplay event timeline. */
export const MATCH_EVENT_TYPES = [
  'kill',
  'turtle',
  'lord',
  'turret',
  'teamfight',
  'other',
] as const;
export type MatchEventType = (typeof MATCH_EVENT_TYPES)[number];

export const MATCH_EVENT_PHASES = ['pre', 'main', 'post'] as const;
export type MatchEventPhase = (typeof MATCH_EVENT_PHASES)[number];

export const MATCH_TIMELINE_STATUSES = [
  'draft',
  'proposed',
  'corrected',
  'approved',
] as const;
export type MatchTimelineStatus = (typeof MATCH_TIMELINE_STATUSES)[number];

/** Milestone 6 — event-based edit + Shorts lifecycle. */
export const MATCH_EDIT_STATUSES = [
  'planned',
  'rendered',
  'approved',
  'rejected',
] as const;
export type MatchEditStatus = (typeof MATCH_EDIT_STATUSES)[number];

/** Exact phrase required before distributing match edit / Shorts. */
export const APPROVE_MATCH_DISTRIBUTION_PHRASE = 'APPROVE_MATCH_DISTRIBUTION' as const;

/** Defaults for condensed match edits and highlight Shorts. */
export const MATCH_EDIT_DEFAULTS = {
  pre_pad_seconds: 3,
  post_pad_seconds: 3,
  boring_speed: 4,
  min_gap_for_boring_seconds: 8,
  /** Full condensed edit may exceed Shorts length. */
  condensed_max_seconds: 180,
  short_max_seconds: 59,
  max_shorts: 2,
  short_min_confidence: 0.55,
  /** Prefer these event types when selecting Shorts. */
  short_priority_types: ['teamfight', 'lord', 'kill', 'turtle', 'turret'] as const,
} as const;

/** Milestone 7 — optional automation & cost controls. */
export const KB_SYNC_RUN_STATUSES = [
  'scanned',
  'skipped_unchanged',
  'imported_draft',
  'failed',
] as const;
export type KbSyncRunStatus = (typeof KB_SYNC_RUN_STATUSES)[number];

export const MATCH_SPEND_DOMAINS = ['match_vision', 'tts', 'other'] as const;
export type MatchSpendDomain = (typeof MATCH_SPEND_DOMAINS)[number];

/**
 * Paid automation defaults — all spend features OFF until explicitly enabled.
 * Sync never publishes; operators must still confirm PUBLISH_GAME_KNOWLEDGE.
 */
export const MATCH_AUTOMATION_DEFAULTS = {
  paid_vision_enabled: false,
  tts_spend_enabled: false,
  /** Directory pull only; never invents Moonton/network APIs. */
  allow_remote_artifact_fetch: false,
} as const;

/** Match Studio product lifecycle (orthogonal to shorts workflow_state). */
export const MATCH_STUDIO_STATUSES = [
  'draft',
  'awaiting_upload',
  'ingesting',
  'ready_for_analysis',
  'analyzing',
  'awaiting_timeline_review',
  'commentary_pending',
  'awaiting_commentary_review',
  'voice_pending',
  'awaiting_voice_approval',
  'edl_pending',
  'awaiting_edit_review',
  'rendering',
  'awaiting_final_approval',
  'completed',
  'failed',
  'cancelled',
] as const;
export type MatchStudioStatus = (typeof MATCH_STUDIO_STATUSES)[number];

export const MATCH_STUDIO_PATCH_RESOLUTIONS = ['bound', 'unknown', 'draft_only'] as const;
export type MatchStudioPatchResolution = (typeof MATCH_STUDIO_PATCH_RESOLUTIONS)[number];

export const MATCH_COMMENTARY_STYLES = [
  'esports_caster',
  'highlight_energetic',
  'tactical_analyst',
  'documentary',
] as const;
export type MatchCommentaryStyle = (typeof MATCH_COMMENTARY_STYLES)[number];

export const MATCH_CAPABILITY_STATUSES = [
  'supported',
  'partial',
  'stub',
  'unavailable',
  'not_implemented',
] as const;
export type MatchCapabilityStatus = (typeof MATCH_CAPABILITY_STATUSES)[number];

/** Default Match Studio ingest limits (env-overridable; not Flow 20s). */
export const MATCH_INGEST_DEFAULTS = {
  maxUploadBytes: 8 * 1024 * 1024 * 1024,
  minDurationSeconds: 30,
  maxDurationSeconds: 7200,
  minWidth: 480,
  minHeight: 480,
} as const;
