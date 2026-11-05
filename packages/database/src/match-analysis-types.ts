import type {
  GameServerEnvironment,
  MatchAnalysisStatus,
} from '@ai-shorts-factory/shared-types';
import type { HudRecognitionConfig } from '@ai-shorts-factory/validation';

export type MatchSourceRecord = {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  storage_key: string | null;
  local_path: string | null;
  content_checksum_sha256: string | null;
  byte_size: number | null;
  duration_seconds: number | null;
  server_environment: GameServerEnvironment;
  /** Null when Match Studio patch_resolution is unknown. */
  game_patch_id: string | null;
  probe_json: Record<string, unknown>;
  ingest_status: string;
  original_filename: string;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type MatchRosterEntry = {
  slot: number;
  player_tag: string | null;
  player_tag_confidence: number | null;
  hero_name_raw: string | null;
  hero_key: string | null;
  hero_name: string | null;
  hero_confidence: number | null;
  evidence: {
    region_id: string;
    frame_timestamp_seconds: number;
    ocr_text: string;
    ocr_confidence: number | null;
    ocr_provider: string;
  };
};

export type MatchOcrRegionEvidence = {
  region_id: string;
  frame_timestamp_seconds: number;
  crop_path: string;
  text: string;
  confidence: number | null;
  provider: string;
};

export type MatchRosterAnalysisResult = {
  match_source_id: string;
  server_environment: GameServerEnvironment;
  game_patch_id: string;
  cache_key: string;
  frames_sampled: number;
  ocr_regions: MatchOcrRegionEvidence[];
  roster: MatchRosterEntry[];
  metrics: {
    lines_parsed: number;
    heroes_mapped: number;
    heroes_unmapped: number;
    mean_hero_confidence: number | null;
  };
};

export type MatchAnalysisJobRecord = {
  id: string;
  user_id: string;
  match_source_id: string;
  status: MatchAnalysisStatus;
  cache_key: string;
  recognition_config: HudRecognitionConfig;
  result: MatchRosterAnalysisResult | Record<string, never>;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateMatchSourceInput = {
  title: string;
  /** Local absolute path when registering a server-readable file. Optional for cloud uploads. */
  local_path?: string | null;
  server_environment: GameServerEnvironment;
  game_patch_id?: string | null;
  project_id?: string | null;
  notes?: string;
  storage_key?: string | null;
  content_checksum_sha256?: string | null;
  byte_size?: number | null;
  duration_seconds?: number | null;
  probe_json?: Record<string, unknown>;
  ingest_status?: string;
  original_filename?: string;
};

export type UpdateMatchSourceInput = Partial<{
  project_id: string | null;
  storage_key: string | null;
  local_path: string | null;
  content_checksum_sha256: string | null;
  byte_size: number | null;
  duration_seconds: number | null;
  game_patch_id: string | null;
  probe_json: Record<string, unknown>;
  ingest_status: string;
  original_filename: string;
  notes: string;
}>;

export interface MatchAnalysisRepository {
  createSource(userId: string, input: CreateMatchSourceInput): Promise<MatchSourceRecord>;
  updateSource(
    userId: string,
    sourceId: string,
    input: UpdateMatchSourceInput,
  ): Promise<MatchSourceRecord>;
  getSource(userId: string, sourceId: string): Promise<MatchSourceRecord | null>;
  listSources(userId: string): Promise<MatchSourceRecord[]>;
  listSourcesByProject(userId: string, projectId: string): Promise<MatchSourceRecord[]>;
  getJobByCacheKey(
    userId: string,
    matchSourceId: string,
    cacheKey: string,
  ): Promise<MatchAnalysisJobRecord | null>;
  saveJob(userId: string, job: MatchAnalysisJobRecord): Promise<MatchAnalysisJobRecord>;
  listJobsForSource(userId: string, matchSourceId: string): Promise<MatchAnalysisJobRecord[]>;
}
