import type {
  DistributionStatus,
  EnvironmentKind,
  GameServerEnvironment,
  SocialConnectionStatus,
  SocialPlatform,
  WorkflowState,
} from '@ai-shorts-factory/shared-types';
import type {
  BrandColors,
  CreateBrandPayload,
  CreateDistributionPayload,
  CreateEnvironmentPayload,
  CreateSocialAccountPayload,
  CreateVideoPayload,
  ProjectDnaSnapshot,
  UpdateBrandPayload,
  UpdateDistributionPayload,
  UpdateEnvironmentPayload,
  UpdateSocialAccountPayload,
  UpdateVideoPayload,
} from '@ai-shorts-factory/validation';

export type BrandRecord = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  logo_asset_id: string | null;
  colors: BrandColors;
  default_watermark_asset_id: string | null;
  target_audience: string;
  brand_voice: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ProjectDnaVersionRecord = {
  id: string;
  project_id: string;
  version: number;
  snapshot: ProjectDnaSnapshot;
  note: string;
  created_by: string | null;
  created_at: string;
};

/** Compact context frozen on a video for reproducibility (not a full DNA dump). */
export type VideoContextSnapshot = {
  project_id: string;
  project_dna_version: number;
  content_niche: string;
  visual_style: string;
  language: string;
  target_audience: string;
  continuity_policy: string;
  production_defaults: ProjectDnaSnapshot['production_defaults'];
  prompt_instructions: ProjectDnaSnapshot['prompt_instructions'];
};

export type VideoRecord = {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  concept: string;
  story_brief: string;
  special_instructions: string;
  workflow_state: WorkflowState;
  captions_on_video: boolean;
  project_dna_version: number;
  context_snapshot: VideoContextSnapshot;
  /** Match/server environment for game-intelligence (null = unbound). */
  game_server_environment: GameServerEnvironment | null;
  /** Published game patch pinned for this video/match. */
  game_patch_id: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type EnvironmentRecord = {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  kind: EnvironmentKind;
  description: string;
  visual_identity: string;
  continuity_rules: string;
  reference_image_prompt: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type SocialAccountRecord = {
  id: string;
  user_id: string;
  brand_id: string | null;
  platform: SocialPlatform;
  display_name: string;
  handle: string;
  connection_status: SocialConnectionStatus;
  /** Never true until an authorized integration exists and succeeds. */
  publishing_enabled: boolean;
  default_caption_rules: string;
  default_hashtag_rules: string;
  default_content_format: string;
  account_preferences: Record<string, unknown>;
  /** Opaque secret reference — never return raw tokens in UI payloads. */
  secret_ref: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ProjectSocialAccountRecord = {
  project_id: string;
  social_account_id: string;
  is_default: boolean;
  created_at: string;
};

export type DistributionRetryEntry = {
  at: string;
  reason: string;
  status: DistributionStatus;
};

export type VideoDistributionRecord = {
  id: string;
  video_id: string;
  project_id: string;
  social_account_id: string;
  platform: SocialPlatform;
  target_format: string;
  caption: string;
  hashtags: string[];
  thumbnail_asset_id: string | null;
  /** Derived platform asset; never overwrites master assembly. */
  derived_asset_id: string | null;
  status: DistributionStatus;
  scheduled_at: string | null;
  published_url: string | null;
  platform_reference_id: string | null;
  failure_reason: string | null;
  retry_history: DistributionRetryEntry[];
  created_at: string;
  updated_at: string;
};

export interface BrandRepository {
  listByUser(userId: string): Promise<BrandRecord[]>;
  getById(userId: string, brandId: string): Promise<BrandRecord | null>;
  create(userId: string, input: CreateBrandPayload): Promise<BrandRecord>;
  update(userId: string, brandId: string, input: UpdateBrandPayload): Promise<BrandRecord>;
  softDelete(userId: string, brandId: string): Promise<void>;
  /** Ensures a Personal brand exists for the user; returns it. */
  ensurePersonalBrand(userId: string): Promise<BrandRecord>;
}

export interface ProjectDnaRepository {
  getCurrent(userId: string, projectId: string): Promise<ProjectDnaVersionRecord | null>;
  getVersion(
    userId: string,
    projectId: string,
    version: number,
  ): Promise<ProjectDnaVersionRecord | null>;
  listVersions(userId: string, projectId: string): Promise<ProjectDnaVersionRecord[]>;
  /**
   * Persist a new immutable DNA version and advance the project's current pointer.
   * Does not mutate existing videos.
   */
  publishVersion(
    userId: string,
    projectId: string,
    snapshot: ProjectDnaSnapshot,
    note?: string,
  ): Promise<ProjectDnaVersionRecord>;
  seedInitial(
    userId: string,
    projectId: string,
    snapshot: ProjectDnaSnapshot,
  ): Promise<ProjectDnaVersionRecord>;
}

export interface VideoRepository {
  listByProject(userId: string, projectId: string): Promise<VideoRecord[]>;
  getById(userId: string, videoId: string): Promise<VideoRecord | null>;
  /** Legacy shim: sole video for a legacy_single_video project, else null. */
  getLegacyVideoForProject(userId: string, projectId: string): Promise<VideoRecord | null>;
  create(
    userId: string,
    projectId: string,
    input: CreateVideoPayload,
    inheritance: {
      project_dna_version: number;
      context_snapshot: VideoContextSnapshot;
      captions_on_video?: boolean;
      title?: string;
    },
  ): Promise<VideoRecord>;
  update(userId: string, videoId: string, input: UpdateVideoPayload): Promise<VideoRecord>;
  setWorkflowState(
    userId: string,
    videoId: string,
    state: WorkflowState,
  ): Promise<VideoRecord>;
  /**
   * Refresh inherited DNA for a video that is not yet approved.
   * Approved/completed videos retain their original snapshot.
   */
  refreshInheritedDna(
    userId: string,
    videoId: string,
    inheritance: {
      project_dna_version: number;
      context_snapshot: VideoContextSnapshot;
    },
  ): Promise<VideoRecord>;
  softDelete(userId: string, videoId: string): Promise<void>;
  setGameKnowledgeBinding?(
    userId: string,
    videoId: string,
    binding: {
      game_server_environment: GameServerEnvironment | null;
      game_patch_id: string | null;
    },
  ): Promise<VideoRecord>;
}

export interface EnvironmentRepository {
  listByProject(userId: string, projectId: string): Promise<EnvironmentRecord[]>;
  getById(userId: string, environmentId: string): Promise<EnvironmentRecord | null>;
  create(
    userId: string,
    projectId: string,
    input: CreateEnvironmentPayload,
  ): Promise<EnvironmentRecord>;
  update(
    userId: string,
    environmentId: string,
    input: UpdateEnvironmentPayload,
  ): Promise<EnvironmentRecord>;
  archive(userId: string, environmentId: string): Promise<EnvironmentRecord>;
}

export interface SocialAccountRepository {
  listByUser(userId: string): Promise<SocialAccountRecord[]>;
  listByBrand(userId: string, brandId: string): Promise<SocialAccountRecord[]>;
  listByProject(userId: string, projectId: string): Promise<SocialAccountRecord[]>;
  getById(userId: string, accountId: string): Promise<SocialAccountRecord | null>;
  create(userId: string, input: CreateSocialAccountPayload): Promise<SocialAccountRecord>;
  update(
    userId: string,
    accountId: string,
    input: UpdateSocialAccountPayload,
  ): Promise<SocialAccountRecord>;
  softDelete(userId: string, accountId: string): Promise<void>;
  linkToProject(
    userId: string,
    projectId: string,
    socialAccountId: string,
    isDefault?: boolean,
  ): Promise<ProjectSocialAccountRecord>;
  unlinkFromProject(
    userId: string,
    projectId: string,
    socialAccountId: string,
  ): Promise<void>;
}

export interface DistributionRepository {
  listByVideo(userId: string, videoId: string): Promise<VideoDistributionRecord[]>;
  getById(userId: string, distributionId: string): Promise<VideoDistributionRecord | null>;
  create(
    userId: string,
    videoId: string,
    projectId: string,
    input: CreateDistributionPayload & { platform: SocialPlatform },
  ): Promise<VideoDistributionRecord>;
  update(
    userId: string,
    distributionId: string,
    input: UpdateDistributionPayload,
  ): Promise<VideoDistributionRecord>;
}

export type { CreateBrandPayload, UpdateBrandPayload, CreateVideoPayload, UpdateVideoPayload };
