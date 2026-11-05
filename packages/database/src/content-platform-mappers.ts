import { parseProjectDnaSnapshot } from '@ai-shorts-factory/validation';
import type {
  BrandRecord,
  DistributionRetryEntry,
  EnvironmentRecord,
  ProjectDnaVersionRecord,
  ProjectSocialAccountRecord,
  SocialAccountRecord,
  VideoContextSnapshot,
  VideoDistributionRecord,
  VideoRecord,
} from './content-platform-types.js';

export function mapBrandRow(row: Record<string, unknown>): BrandRecord {
  const colors = (row.colors ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    logo_asset_id: (row.logo_asset_id as string | null) ?? null,
    colors: {
      primary: String(colors.primary ?? ''),
      secondary: String(colors.secondary ?? ''),
      accent: String(colors.accent ?? ''),
      extra: Array.isArray(colors.extra) ? colors.extra.map(String) : [],
    },
    default_watermark_asset_id: (row.default_watermark_asset_id as string | null) ?? null,
    target_audience: String(row.target_audience ?? ''),
    brand_voice: String(row.brand_voice ?? ''),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: (row.deleted_at as string | null) ?? null,
  };
}

export function mapDnaVersionRow(row: Record<string, unknown>): ProjectDnaVersionRecord {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    version: Number(row.version),
    snapshot: parseProjectDnaSnapshot(row.snapshot),
    note: String(row.note ?? ''),
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

export function mapVideoContextSnapshot(value: unknown): VideoContextSnapshot {
  const raw = (value ?? {}) as Record<string, unknown>;
  const filled = parseProjectDnaSnapshot({
    identity: { name: 'snapshot' },
    production_defaults: raw.production_defaults ?? {},
    prompt_instructions: raw.prompt_instructions ?? {},
  });
  return {
    project_id: String(raw.project_id ?? ''),
    project_dna_version: Number(raw.project_dna_version ?? 1),
    content_niche: String(raw.content_niche ?? ''),
    visual_style: String(raw.visual_style ?? 'automatic'),
    language: String(raw.language ?? 'en'),
    target_audience: String(raw.target_audience ?? ''),
    continuity_policy: String(raw.continuity_policy ?? 'reuse existing project characters'),
    production_defaults: filled.production_defaults,
    prompt_instructions: filled.prompt_instructions,
  };
}

export function mapVideoRow(row: Record<string, unknown>): VideoRecord {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    user_id: String(row.user_id),
    title: String(row.title ?? ''),
    concept: String(row.concept ?? ''),
    story_brief: String(row.story_brief ?? ''),
    special_instructions: String(row.special_instructions ?? ''),
    workflow_state: row.workflow_state as VideoRecord['workflow_state'],
    captions_on_video: Boolean(row.captions_on_video),
    project_dna_version: Number(row.project_dna_version ?? 1),
    context_snapshot: mapVideoContextSnapshot(row.context_snapshot),
    game_server_environment:
      (row.game_server_environment as VideoRecord['game_server_environment']) ?? null,
    game_patch_id: (row.game_patch_id as string | null) ?? null,
    approved_at: (row.approved_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: (row.deleted_at as string | null) ?? null,
  };
}

export function mapEnvironmentRow(row: Record<string, unknown>): EnvironmentRecord {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    user_id: String(row.user_id),
    name: String(row.name ?? ''),
    kind: row.kind as EnvironmentRecord['kind'],
    description: String(row.description ?? ''),
    visual_identity: String(row.visual_identity ?? ''),
    continuity_rules: String(row.continuity_rules ?? ''),
    reference_image_prompt: String(row.reference_image_prompt ?? ''),
    active: row.active !== false,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapSocialAccountRow(
  row: Record<string, unknown>,
  options?: { redactSecret?: boolean },
): SocialAccountRecord {
  const secret = (row.secret_ref as string | null) ?? null;
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    brand_id: (row.brand_id as string | null) ?? null,
    platform: row.platform as SocialAccountRecord['platform'],
    display_name: String(row.display_name ?? ''),
    handle: String(row.handle ?? ''),
    connection_status: row.connection_status as SocialAccountRecord['connection_status'],
    publishing_enabled: Boolean(row.publishing_enabled),
    default_caption_rules: String(row.default_caption_rules ?? ''),
    default_hashtag_rules: String(row.default_hashtag_rules ?? ''),
    default_content_format: String(row.default_content_format ?? '9:16'),
    account_preferences: (row.account_preferences as Record<string, unknown>) ?? {},
    secret_ref: options?.redactSecret && secret ? '[redacted]' : secret,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: (row.deleted_at as string | null) ?? null,
  };
}

export function mapProjectSocialLinkRow(row: Record<string, unknown>): ProjectSocialAccountRecord {
  return {
    project_id: String(row.project_id),
    social_account_id: String(row.social_account_id),
    is_default: Boolean(row.is_default),
    created_at: String(row.created_at),
  };
}

export function mapDistributionRow(row: Record<string, unknown>): VideoDistributionRecord {
  const retries = Array.isArray(row.retry_history) ? row.retry_history : [];
  return {
    id: String(row.id),
    video_id: String(row.video_id),
    project_id: String(row.project_id),
    social_account_id: String(row.social_account_id),
    platform: row.platform as VideoDistributionRecord['platform'],
    target_format: String(row.target_format ?? '9:16'),
    caption: String(row.caption ?? ''),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags.map(String) : [],
    thumbnail_asset_id: (row.thumbnail_asset_id as string | null) ?? null,
    derived_asset_id: (row.derived_asset_id as string | null) ?? null,
    status: row.status as VideoDistributionRecord['status'],
    scheduled_at: (row.scheduled_at as string | null) ?? null,
    published_url: (row.published_url as string | null) ?? null,
    platform_reference_id: (row.platform_reference_id as string | null) ?? null,
    failure_reason: (row.failure_reason as string | null) ?? null,
    retry_history: retries as DistributionRetryEntry[],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
