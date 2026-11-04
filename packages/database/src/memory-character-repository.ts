import { randomUUID } from 'node:crypto';
import type { ProjectRepository } from './types.js';
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  UpdateCharacterInput,
} from './story-types.js';

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryCharacterRepository implements CharacterRepository {
  private readonly characters = new Map<string, CharacterRecord>();
  private readonly projectLinks = new Map<string, Set<string>>();

  constructor(private readonly projects: ProjectRepository) {}

  async listByUser(userId: string): Promise<CharacterRecord[]> {
    return [...this.characters.values()]
      .filter((c) => c.user_id === userId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => structuredClone(c));
  }

  async listByProject(userId: string, projectId: string): Promise<CharacterRecord[]> {
    await this.requireProject(userId, projectId);
    const linked = this.projectLinks.get(projectId) ?? new Set<string>();
    return [...linked]
      .map((id) => this.characters.get(id))
      .filter((c): c is CharacterRecord => c !== undefined && c.user_id === userId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => structuredClone(c));
  }

  async create(userId: string, input: CreateCharacterInput): Promise<CharacterRecord> {
    const timestamp = nowIso();
    const character: CharacterRecord = {
      id: randomUUID(),
      user_id: userId,
      name: input.name.trim(),
      description: input.description.trim(),
      visual_identity: input.visual_identity.trim(),
      clothing: input.clothing?.trim() ?? '',
      appearance_details: input.appearance_details?.trim() ?? '',
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.characters.set(character.id, character);
    return structuredClone(character);
  }

  async update(
    userId: string,
    characterId: string,
    input: UpdateCharacterInput,
  ): Promise<CharacterRecord> {
    const existing = this.characters.get(characterId);
    if (!existing || existing.user_id !== userId) {
      throw new Error('Character not found');
    }
    const updated: CharacterRecord = {
      ...existing,
      name: input.name?.trim() ?? existing.name,
      description: input.description?.trim() ?? existing.description,
      visual_identity: input.visual_identity?.trim() ?? existing.visual_identity,
      clothing: input.clothing?.trim() ?? existing.clothing,
      appearance_details: input.appearance_details?.trim() ?? existing.appearance_details,
      updated_at: nowIso(),
    };
    this.characters.set(characterId, updated);
    return structuredClone(updated);
  }

  async delete(userId: string, characterId: string): Promise<void> {
    const existing = this.characters.get(characterId);
    if (!existing || existing.user_id !== userId) {
      throw new Error('Character not found');
    }
    this.characters.delete(characterId);
    for (const links of this.projectLinks.values()) {
      links.delete(characterId);
    }
  }

  async linkToProject(userId: string, projectId: string, characterId: string): Promise<void> {
    await this.requireProject(userId, projectId);
    const character = this.characters.get(characterId);
    if (!character || character.user_id !== userId) {
      throw new Error('Character not found');
    }
    const links = this.projectLinks.get(projectId) ?? new Set<string>();
    links.add(characterId);
    this.projectLinks.set(projectId, links);
  }

  async unlinkFromProject(userId: string, projectId: string, characterId: string): Promise<void> {
    await this.requireProject(userId, projectId);
    this.projectLinks.get(projectId)?.delete(characterId);
  }

  clear(): void {
    this.characters.clear();
    this.projectLinks.clear();
  }

  exportAll(): {
    characters: CharacterRecord[];
    projectLinks: Array<{ projectId: string; characterIds: string[] }>;
  } {
    return {
      characters: [...this.characters.values()].map((character) => structuredClone(character)),
      projectLinks: [...this.projectLinks.entries()].map(([projectId, characterIds]) => ({
        projectId,
        characterIds: [...characterIds],
      })),
    };
  }

  importAll(input: {
    characters: CharacterRecord[];
    projectLinks: Array<{ projectId: string; characterIds: string[] }>;
  }): void {
    this.characters.clear();
    this.projectLinks.clear();
    for (const character of input.characters) {
      this.characters.set(character.id, structuredClone(character));
    }
    for (const link of input.projectLinks) {
      this.projectLinks.set(link.projectId, new Set(link.characterIds));
    }
  }

  private async requireProject(userId: string, projectId: string) {
    const project = await this.projects.getById(userId, projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    return project;
  }
}
