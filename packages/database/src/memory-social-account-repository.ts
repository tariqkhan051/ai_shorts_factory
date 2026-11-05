import { randomUUID } from 'node:crypto';
import type {
  CreateSocialAccountPayload,
  UpdateSocialAccountPayload,
} from '@ai-shorts-factory/validation';
import type {
  ProjectSocialAccountRecord,
  SocialAccountRecord,
  SocialAccountRepository,
} from './content-platform-types.js';
import type { MemoryProjectRepository } from './memory-project-repository.js';

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Social account registration + project destination mapping.
 * connection_status stays `registered` until an authorized integration connects.
 * secret_ref is opaque; never expose raw tokens.
 */
export class MemorySocialAccountRepository implements SocialAccountRepository {
  private readonly accounts = new Map<string, SocialAccountRecord>();
  private readonly links = new Map<string, ProjectSocialAccountRecord>();

  constructor(private readonly projects: MemoryProjectRepository) {}

  private linkKey(projectId: string, accountId: string): string {
    return `${projectId}:${accountId}`;
  }

  async listByUser(userId: string): Promise<SocialAccountRecord[]> {
    return [...this.accounts.values()]
      .filter((a) => a.user_id === userId && !a.deleted_at)
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
      .map((a) => this.publicClone(a));
  }

  async listByBrand(userId: string, brandId: string): Promise<SocialAccountRecord[]> {
    return (await this.listByUser(userId)).filter((a) => a.brand_id === brandId);
  }

  async listByProject(userId: string, projectId: string): Promise<SocialAccountRecord[]> {
    const project = this.projects.exportAll().find((p) => p.id === projectId);
    if (!project || project.user_id !== userId) return [];
    const accountIds = [...this.links.values()]
      .filter((l) => l.project_id === projectId)
      .map((l) => l.social_account_id);
    return (await this.listByUser(userId)).filter((a) => accountIds.includes(a.id));
  }

  async getById(userId: string, accountId: string): Promise<SocialAccountRecord | null> {
    const account = this.accounts.get(accountId);
    if (!account || account.user_id !== userId || account.deleted_at) return null;
    return this.publicClone(account);
  }

  async create(
    userId: string,
    input: CreateSocialAccountPayload,
  ): Promise<SocialAccountRecord> {
    const timestamp = nowIso();
    const account: SocialAccountRecord = {
      id: randomUUID(),
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
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    };
    this.accounts.set(account.id, account);
    return this.publicClone(account);
  }

  async update(
    userId: string,
    accountId: string,
    input: UpdateSocialAccountPayload,
  ): Promise<SocialAccountRecord> {
    const existing = this.accounts.get(accountId);
    if (!existing || existing.user_id !== userId || existing.deleted_at) {
      throw new Error('Social account not found');
    }
    const updated: SocialAccountRecord = {
      ...existing,
      brand_id: input.brand_id !== undefined ? input.brand_id ?? null : existing.brand_id,
      display_name: input.display_name ?? existing.display_name,
      handle: input.handle ?? existing.handle,
      default_caption_rules: input.default_caption_rules ?? existing.default_caption_rules,
      default_hashtag_rules: input.default_hashtag_rules ?? existing.default_hashtag_rules,
      default_content_format: input.default_content_format ?? existing.default_content_format,
      account_preferences: input.account_preferences ?? existing.account_preferences,
      updated_at: nowIso(),
    };
    this.accounts.set(accountId, updated);
    return this.publicClone(updated);
  }

  async softDelete(userId: string, accountId: string): Promise<void> {
    const existing = this.accounts.get(accountId);
    if (!existing || existing.user_id !== userId || existing.deleted_at) {
      throw new Error('Social account not found');
    }
    this.accounts.set(accountId, {
      ...existing,
      deleted_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  async linkToProject(
    userId: string,
    projectId: string,
    socialAccountId: string,
    isDefault = false,
  ): Promise<ProjectSocialAccountRecord> {
    const project = this.projects.exportAll().find((p) => p.id === projectId);
    if (!project || project.user_id !== userId || project.deleted_at) {
      throw new Error('Project not found');
    }
    const account = await this.getById(userId, socialAccountId);
    if (!account) throw new Error('Social account not found');

    if (isDefault) {
      for (const [key, link] of this.links) {
        if (link.project_id === projectId && link.is_default) {
          this.links.set(key, { ...link, is_default: false });
        }
      }
    }

    const record: ProjectSocialAccountRecord = {
      project_id: projectId,
      social_account_id: socialAccountId,
      is_default: isDefault,
      created_at: nowIso(),
    };
    this.links.set(this.linkKey(projectId, socialAccountId), record);
    return structuredClone(record);
  }

  async unlinkFromProject(
    userId: string,
    projectId: string,
    socialAccountId: string,
  ): Promise<void> {
    const project = this.projects.exportAll().find((p) => p.id === projectId);
    if (!project || project.user_id !== userId) throw new Error('Project not found');
    this.links.delete(this.linkKey(projectId, socialAccountId));
  }

  /** Public clone never includes a usable secret — secret_ref stays opaque or null. */
  private publicClone(account: SocialAccountRecord): SocialAccountRecord {
    return structuredClone({
      ...account,
      secret_ref: account.secret_ref ? '[redacted]' : null,
    });
  }

  clear(): void {
    this.accounts.clear();
    this.links.clear();
  }

  exportAll(): { accounts: SocialAccountRecord[]; links: ProjectSocialAccountRecord[] } {
    return {
      accounts: [...this.accounts.values()].map((a) => structuredClone(a)),
      links: [...this.links.values()].map((l) => structuredClone(l)),
    };
  }

  importAll(data: {
    accounts: SocialAccountRecord[];
    links: ProjectSocialAccountRecord[];
  }): void {
    this.accounts.clear();
    this.links.clear();
    for (const account of data.accounts) {
      this.accounts.set(account.id, structuredClone(account));
    }
    for (const link of data.links) {
      this.links.set(this.linkKey(link.project_id, link.social_account_id), structuredClone(link));
    }
  }
}
