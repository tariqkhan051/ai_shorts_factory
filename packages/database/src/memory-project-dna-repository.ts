import { randomUUID } from 'node:crypto';
import type { ProjectDnaSnapshot } from '@ai-shorts-factory/validation';
import type { ProjectDnaRepository, ProjectDnaVersionRecord } from './content-platform-types.js';
import type { MemoryProjectRepository } from './memory-project-repository.js';

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryProjectDnaRepository implements ProjectDnaRepository {
  private readonly versions = new Map<string, ProjectDnaVersionRecord>();

  constructor(private readonly projects: MemoryProjectRepository) {}

  private assertProjectOwned(userId: string, projectId: string): void {
    const project = this.projects.exportAll().find((p) => p.id === projectId);
    if (!project || project.user_id !== userId || project.deleted_at) {
      throw new Error('Project not found');
    }
  }

  async getCurrent(userId: string, projectId: string): Promise<ProjectDnaVersionRecord | null> {
    this.assertProjectOwned(userId, projectId);
    const project = await this.projects.getById(userId, projectId);
    if (!project) return null;
    return this.getVersion(userId, projectId, project.dna_current_version);
  }

  async getVersion(
    userId: string,
    projectId: string,
    version: number,
  ): Promise<ProjectDnaVersionRecord | null> {
    this.assertProjectOwned(userId, projectId);
    const match = [...this.versions.values()].find(
      (v) => v.project_id === projectId && v.version === version,
    );
    return match ? structuredClone(match) : null;
  }

  async listVersions(userId: string, projectId: string): Promise<ProjectDnaVersionRecord[]> {
    this.assertProjectOwned(userId, projectId);
    return [...this.versions.values()]
      .filter((v) => v.project_id === projectId)
      .sort((a, b) => a.version - b.version)
      .map((v) => structuredClone(v));
  }

  async seedInitial(
    userId: string,
    projectId: string,
    snapshot: ProjectDnaSnapshot,
  ): Promise<ProjectDnaVersionRecord> {
    this.assertProjectOwned(userId, projectId);
    const existing = await this.listVersions(userId, projectId);
    if (existing.length > 0) {
      throw new Error('Project DNA already seeded');
    }
    const record: ProjectDnaVersionRecord = {
      id: randomUUID(),
      project_id: projectId,
      version: 1,
      snapshot: structuredClone(snapshot),
      note: 'Initial Project DNA',
      created_by: userId,
      created_at: nowIso(),
    };
    this.versions.set(record.id, record);
    await this.projects.setDnaVersion(userId, projectId, 1);
    return structuredClone(record);
  }

  async publishVersion(
    userId: string,
    projectId: string,
    snapshot: ProjectDnaSnapshot,
    note = '',
  ): Promise<ProjectDnaVersionRecord> {
    this.assertProjectOwned(userId, projectId);
    const versions = await this.listVersions(userId, projectId);
    const nextVersion =
      versions.length === 0 ? 1 : Math.max(...versions.map((v) => v.version)) + 1;
    const record: ProjectDnaVersionRecord = {
      id: randomUUID(),
      project_id: projectId,
      version: nextVersion,
      snapshot: structuredClone(snapshot),
      note,
      created_by: userId,
      created_at: nowIso(),
    };
    this.versions.set(record.id, record);
    await this.projects.setDnaVersion(userId, projectId, nextVersion);
    return structuredClone(record);
  }

  clear(): void {
    this.versions.clear();
  }

  exportAll(): ProjectDnaVersionRecord[] {
    return [...this.versions.values()].map((v) => structuredClone(v));
  }

  importAll(records: ProjectDnaVersionRecord[]): void {
    this.versions.clear();
    for (const record of records) {
      this.versions.set(record.id, structuredClone(record));
    }
  }
}
