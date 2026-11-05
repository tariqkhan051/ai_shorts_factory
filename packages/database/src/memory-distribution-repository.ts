import { randomUUID } from 'node:crypto';
import type { SocialPlatform } from '@ai-shorts-factory/shared-types';
import type {
  CreateDistributionPayload,
  UpdateDistributionPayload,
} from '@ai-shorts-factory/validation';
import type {
  DistributionRepository,
  VideoDistributionRecord,
} from './content-platform-types.js';
import type { MemoryVideoRepository } from './memory-video-repository.js';
import type { MemorySocialAccountRepository } from './memory-social-account-repository.js';

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryDistributionRepository implements DistributionRepository {
  private readonly distributions = new Map<string, VideoDistributionRecord>();

  constructor(
    private readonly videos: MemoryVideoRepository,
    private readonly socialAccounts: MemorySocialAccountRepository,
  ) {}

  async listByVideo(userId: string, videoId: string): Promise<VideoDistributionRecord[]> {
    const video = await this.videos.getById(userId, videoId);
    if (!video) return [];
    return [...this.distributions.values()]
      .filter((d) => d.video_id === videoId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((d) => structuredClone(d));
  }

  async getById(
    userId: string,
    distributionId: string,
  ): Promise<VideoDistributionRecord | null> {
    const dist = this.distributions.get(distributionId);
    if (!dist) return null;
    const video = await this.videos.getById(userId, dist.video_id);
    if (!video) return null;
    return structuredClone(dist);
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

    const timestamp = nowIso();
    const record: VideoDistributionRecord = {
      id: randomUUID(),
      video_id: videoId,
      project_id: projectId,
      social_account_id: input.social_account_id,
      platform: input.platform,
      target_format: input.target_format ?? '9:16',
      caption: input.caption ?? '',
      hashtags: input.hashtags ?? [],
      thumbnail_asset_id: input.thumbnail_asset_id ?? null,
      derived_asset_id: null,
      status: 'draft',
      scheduled_at: input.scheduled_at ?? null,
      published_url: null,
      platform_reference_id: null,
      failure_reason: null,
      retry_history: [],
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.distributions.set(record.id, record);
    return structuredClone(record);
  }

  async update(
    userId: string,
    distributionId: string,
    input: UpdateDistributionPayload,
  ): Promise<VideoDistributionRecord> {
    const existing = await this.getById(userId, distributionId);
    if (!existing) throw new Error('Distribution not found');

    let status = input.status ?? existing.status;
    let publishedUrl = input.published_url !== undefined ? input.published_url : existing.published_url;
    const retryHistory = [...existing.retry_history];

    if (input.confirm_manual_publish) {
      status = 'published_manual';
      if (!publishedUrl && input.published_url) publishedUrl = input.published_url;
    }

    if (input.status === 'failed' && input.failure_reason) {
      retryHistory.push({
        at: nowIso(),
        reason: input.failure_reason,
        status: 'failed',
      });
    }

    const updated: VideoDistributionRecord = {
      ...existing,
      target_format: input.target_format ?? existing.target_format,
      caption: input.caption ?? existing.caption,
      hashtags: input.hashtags ?? existing.hashtags,
      thumbnail_asset_id:
        input.thumbnail_asset_id !== undefined
          ? input.thumbnail_asset_id
          : existing.thumbnail_asset_id,
      scheduled_at:
        input.scheduled_at !== undefined ? input.scheduled_at : existing.scheduled_at,
      status,
      published_url: publishedUrl,
      platform_reference_id:
        input.platform_reference_id !== undefined
          ? input.platform_reference_id
          : existing.platform_reference_id,
      failure_reason:
        input.failure_reason !== undefined ? input.failure_reason : existing.failure_reason,
      retry_history: retryHistory,
      updated_at: nowIso(),
    };
    this.distributions.set(distributionId, updated);
    return structuredClone(updated);
  }

  clear(): void {
    this.distributions.clear();
  }

  exportAll(): VideoDistributionRecord[] {
    return [...this.distributions.values()].map((d) => structuredClone(d));
  }

  importAll(records: VideoDistributionRecord[]): void {
    this.distributions.clear();
    for (const record of records) {
      this.distributions.set(record.id, structuredClone(record));
    }
  }
}
