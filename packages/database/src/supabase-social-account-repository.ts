import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CreateSocialAccountPayload,
  UpdateSocialAccountPayload,
} from '@ai-shorts-factory/validation';
import type {
  ProjectSocialAccountRecord,
  SocialAccountRecord,
  SocialAccountRepository,
} from './content-platform-types.js';
import {
  mapProjectSocialLinkRow,
  mapSocialAccountRow,
} from './content-platform-mappers.js';
import type { ProjectRepository } from './types.js';

export class SupabaseSocialAccountRepository implements SocialAccountRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly projects: ProjectRepository,
  ) {}

  async listByUser(userId: string): Promise<SocialAccountRecord[]> {
    const { data, error } = await this.client
      .from('social_accounts')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('display_name', { ascending: true });
    if (error) throw new Error(`Failed to list social accounts: ${error.message}`);
    return (data ?? []).map((row) => mapSocialAccountRow(row, { redactSecret: true }));
  }

  async listByBrand(userId: string, brandId: string): Promise<SocialAccountRecord[]> {
    return (await this.listByUser(userId)).filter((a) => a.brand_id === brandId);
  }

  async listByProject(userId: string, projectId: string): Promise<SocialAccountRecord[]> {
    const project = await this.projects.getById(userId, projectId);
    if (!project) return [];

    const { data, error } = await this.client
      .from('project_social_accounts')
      .select('social_account_id, social_accounts(*)')
      .eq('project_id', projectId);
    if (error) throw new Error(`Failed to list project social accounts: ${error.message}`);

    return (data ?? [])
      .map((row) => {
        const account = Array.isArray(row.social_accounts)
          ? row.social_accounts[0]
          : row.social_accounts;
        return account ? mapSocialAccountRow(account, { redactSecret: true }) : null;
      })
      .filter((a): a is SocialAccountRecord => a !== null && a.user_id === userId && !a.deleted_at);
  }

  async getById(userId: string, accountId: string): Promise<SocialAccountRecord | null> {
    const { data, error } = await this.client
      .from('social_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(`Failed to load social account: ${error.message}`);
    return data ? mapSocialAccountRow(data, { redactSecret: true }) : null;
  }

  async create(
    userId: string,
    input: CreateSocialAccountPayload,
  ): Promise<SocialAccountRecord> {
    const { data, error } = await this.client
      .from('social_accounts')
      .insert({
        user_id: userId,
        brand_id: input.brand_id ?? null,
        platform: input.platform,
        display_name: input.display_name,
        handle: input.handle,
        connection_status: 'registered',
        publishing_enabled: false,
        default_caption_rules: input.default_caption_rules ?? '',
        default_hashtag_rules: input.default_hashtag_rules ?? '',
        default_content_format: input.default_content_format ?? '9:16',
        account_preferences: input.account_preferences ?? {},
        secret_ref: null,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to create social account: ${error?.message ?? 'unknown'}`);
    }
    return mapSocialAccountRow(data, { redactSecret: true });
  }

  async update(
    userId: string,
    accountId: string,
    input: UpdateSocialAccountPayload,
  ): Promise<SocialAccountRecord> {
    const existing = await this.getById(userId, accountId);
    if (!existing) throw new Error('Social account not found');

    const patch: Record<string, unknown> = {};
    if (input.brand_id !== undefined) patch.brand_id = input.brand_id;
    if (input.display_name !== undefined) patch.display_name = input.display_name;
    if (input.handle !== undefined) patch.handle = input.handle;
    if (input.default_caption_rules !== undefined) {
      patch.default_caption_rules = input.default_caption_rules;
    }
    if (input.default_hashtag_rules !== undefined) {
      patch.default_hashtag_rules = input.default_hashtag_rules;
    }
    if (input.default_content_format !== undefined) {
      patch.default_content_format = input.default_content_format;
    }
    if (input.account_preferences !== undefined) {
      patch.account_preferences = input.account_preferences;
    }

    const { error } = await this.client
      .from('social_accounts')
      .update(patch)
      .eq('id', accountId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to update social account: ${error.message}`);

    const updated = await this.getById(userId, accountId);
    if (!updated) throw new Error('Social account disappeared after update');
    return updated;
  }

  async softDelete(userId: string, accountId: string): Promise<void> {
    const { error } = await this.client
      .from('social_accounts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', accountId)
      .eq('user_id', userId)
      .is('deleted_at', null);
    if (error) throw new Error(`Failed to delete social account: ${error.message}`);
  }

  async linkToProject(
    userId: string,
    projectId: string,
    socialAccountId: string,
    isDefault = false,
  ): Promise<ProjectSocialAccountRecord> {
    const project = await this.projects.getById(userId, projectId);
    if (!project) throw new Error('Project not found');
    const account = await this.getById(userId, socialAccountId);
    if (!account) throw new Error('Social account not found');

    if (isDefault) {
      await this.client
        .from('project_social_accounts')
        .update({ is_default: false })
        .eq('project_id', projectId)
        .eq('is_default', true);
    }

    const { data, error } = await this.client
      .from('project_social_accounts')
      .upsert(
        {
          project_id: projectId,
          social_account_id: socialAccountId,
          is_default: isDefault,
        },
        { onConflict: 'project_id,social_account_id' },
      )
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to link social account: ${error?.message ?? 'unknown'}`);
    }
    return mapProjectSocialLinkRow(data);
  }

  async unlinkFromProject(
    userId: string,
    projectId: string,
    socialAccountId: string,
  ): Promise<void> {
    const project = await this.projects.getById(userId, projectId);
    if (!project) throw new Error('Project not found');
    const { error } = await this.client
      .from('project_social_accounts')
      .delete()
      .eq('project_id', projectId)
      .eq('social_account_id', socialAccountId);
    if (error) throw new Error(`Failed to unlink social account: ${error.message}`);
  }
}
