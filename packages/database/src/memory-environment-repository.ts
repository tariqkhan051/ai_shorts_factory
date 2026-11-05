import { randomUUID } from 'node:crypto';
import type {
  CreateEnvironmentPayload,
  UpdateEnvironmentPayload,
} from '@ai-shorts-factory/validation';
import type {
  EnvironmentRecord,
  EnvironmentRepository,
} from './content-platform-types.js';
import type { MemoryProjectRepository } from './memory-project-repository.js';

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryEnvironmentRepository implements EnvironmentRepository {
  private readonly environments = new Map<string, EnvironmentRecord>();

  constructor(private readonly projects: MemoryProjectRepository) {}

  private assertProject(userId: string, projectId: string): void {
    const project = this.projects.exportAll().find((p) => p.id === projectId);
    if (!project || project.user_id !== userId || project.deleted_at) {
      throw new Error('Project not found');
    }
  }

  async listByProject(userId: string, projectId: string): Promise<EnvironmentRecord[]> {
    this.assertProject(userId, projectId);
    return [...this.environments.values()]
      .filter((e) => e.project_id === projectId && e.user_id === userId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => structuredClone(e));
  }

  async getById(userId: string, environmentId: string): Promise<EnvironmentRecord | null> {
    const env = this.environments.get(environmentId);
    if (!env || env.user_id !== userId) return null;
    return structuredClone(env);
  }

  async create(
    userId: string,
    projectId: string,
    input: CreateEnvironmentPayload,
  ): Promise<EnvironmentRecord> {
    this.assertProject(userId, projectId);
    const timestamp = nowIso();
    const record: EnvironmentRecord = {
      id: randomUUID(),
      project_id: projectId,
      user_id: userId,
      name: input.name,
      kind: input.kind ?? 'location',
      description: input.description ?? '',
      visual_identity: input.visual_identity ?? '',
      continuity_rules: input.continuity_rules ?? '',
      reference_image_prompt: input.reference_image_prompt ?? '',
      active: true,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.environments.set(record.id, record);
    return structuredClone(record);
  }

  async update(
    userId: string,
    environmentId: string,
    input: UpdateEnvironmentPayload,
  ): Promise<EnvironmentRecord> {
    const existing = await this.getById(userId, environmentId);
    if (!existing) throw new Error('Environment not found');
    const updated: EnvironmentRecord = {
      ...existing,
      name: input.name ?? existing.name,
      kind: input.kind ?? existing.kind,
      description: input.description ?? existing.description,
      visual_identity: input.visual_identity ?? existing.visual_identity,
      continuity_rules: input.continuity_rules ?? existing.continuity_rules,
      reference_image_prompt: input.reference_image_prompt ?? existing.reference_image_prompt,
      active: input.active ?? existing.active,
      updated_at: nowIso(),
    };
    this.environments.set(environmentId, updated);
    return structuredClone(updated);
  }

  async archive(userId: string, environmentId: string): Promise<EnvironmentRecord> {
    return this.update(userId, environmentId, { active: false });
  }

  clear(): void {
    this.environments.clear();
  }

  exportAll(): EnvironmentRecord[] {
    return [...this.environments.values()].map((e) => structuredClone(e));
  }

  importAll(records: EnvironmentRecord[]): void {
    this.environments.clear();
    for (const record of records) {
      this.environments.set(record.id, structuredClone(record));
    }
  }
}
