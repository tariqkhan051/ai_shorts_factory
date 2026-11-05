import type { SupabaseClient } from '@supabase/supabase-js';
import type { SocialPlatform } from '@ai-shorts-factory/shared-types';
import type {
  CreateDistributionPayload,
  UpdateDistributionPayload,
} from '@ai-shorts-factory/validation';
import type {
  DistributionRepository,
  VideoDistributionRecord,
} from './content-platform-types.js';
import { mapDistributionRow } from './content-platform-mappers.js';
import type { VideoRepository } from './content-platform-types.js';
import type { SocialAccountRepository } from './content-platform-types.js';

export class SupabaseDistributionRepository implements DistributionRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly videos: VideoRepository,
    private readonly socialAccounts: SocialAccountRepository,
  ) {}

  async listByVideo(userId: string, videoId: string): Promise<VideoDistributionRecord[]> {
    const video = await this.videos.getById(userId, videoId);
    if (!video) return [];
    const { data, error } = await this.client
      .from('video_distributions')
      .select('*')
      .eq('video_id', videoId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Failed to list distributions: ${error.message}`);
    return (data ?? []).map((row) => mapDistributionRow(row));
  }

  async getById(
    userId: string,
    distributionId: string,
  ): Promise<VideoDistributionRecord | null> {
    const { data, error } = await this.client
      .from('video_distributions')
      .select('*')
      .eq('id', distributionId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load distribution: ${error.message}`);
    if (!data) return null;
    const video = await this.videos.getById(userId, String(data.video_id));
    if (!video) return null;
    return mapDistributionRow(data);
  }

  async create(
    userId: string,
    videoId: string,
    projectId: string,
    input: CreateDistributionPayload & { platform: SocialPlatform },
  ): Promise<VideoDistributionRecord> {
    const video = await this.videos.getById(userId, videoId);
    if (!video || video.project_id !== projectId) throw new Error('Video not found');
    const account = await this.socialAccounts.getById(userId, input.social_account_id);
    if (!account) throw new Error('Social account not found');
    if (account.platform !== input.platform) {
      throw new Error('Platform does not match social account');
    }

    const { data, error } = await this.client
      .from('video_distributions')
      .insert({
        video_id: videoId,
        project_id: projectId,
        social_account_id: input.social_account_id,
        platform: input.platform,
        target_format: input.target_format ?? '9:16',
        caption: input.caption ?? '',
        hashtags: input.hashtags ?? [],
        thumbnail_asset_id: input.thumbnail_asset_id ?? null,
        status: 'draft',
        scheduled_at: input.scheduled_at ?? null,
        retry_history: [],
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to create distribution: ${error?.message ?? 'unknown'}`);
    }
    return mapDistributionRow(data);
  }

  async update(
    userId: string,
    distributionId: string,
    input: UpdateDistributionPayload,
  ): Promise<VideoDistributionRecord> {
    const existing = await this.getById(userId, distributionId);
    if (!existing) throw new Error('Distribution not found');

    let status = input.status ?? existing.status;
    let publishedUrl =
      input.published_url !== undefined ? input.published_url : existing.published_url;
    const retryHistory = [...existing.retry_history];

    if (input.confirm_manual_publish) {
      status = 'published_manual';
      if (!publishedUrl && input.published_url) publishedUrl = input.published_url;
    }

    if (input.status === 'failed' && input.failure_reason) {
      retryHistory.push({
        at: new Date().toISOString(),
        reason: input.failure_reason,
        status: 'failed',
      });
    }

    const patch: Record<string, unknown> = {
      status,
      published_url: publishedUrl,
      retry_history: retryHistory,
    };
    if (input.target_format !== undefined) patch.target_format = input.target_format;
    if (input.caption !== undefined) patch.caption = input.caption;
    if (input.hashtags !== undefined) patch.hashtags = input.hashtags;
    if (input.thumbnail_asset_id !== undefined) {
      patch.thumbnail_asset_id = input.thumbnail_asset_id;
    }
    if (input.scheduled_at !== undefined) patch.scheduled_at = input.scheduled_at;
    if (input.platform_reference_id !== undefined) {
      patch.platform_reference_id = input.platform_reference_id;
    }
    if (input.failure_reason !== undefined) patch.failure_reason = input.failure_reason;

    const { error } = await this.client
      .from('video_distributions')
      .update(patch)
      .eq('id', distributionId);
    if (error) throw new Error(`Failed to update distribution: ${error.message}`);

    const updated = await this.getById(userId, distributionId);
    if (!updated) throw new Error('Distribution disappeared after update');
    return updated;
  }
}
