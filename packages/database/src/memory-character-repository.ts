import { randomUUID } from 'node:crypto';
import type { ProjectRepository } from './types.js';
import {
  flattenVisualIdentity,
  mergeVisualIdentity,
  normalizeStoredVisualIdentity,
  EMPTY_VISUAL_IDENTITY,
} from './character-visual.js';
import type {
  CharacterRecord,
  CharacterRepository,
  CharacterVersionRecord,
  CreateCharacterInput,
  UpdateCharacterInput,
} from './story-types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function hydrateCharacter(raw: CharacterRecord): CharacterRecord {
  const structured = normalizeStoredVisualIdentity(
    raw.visual_identity_structured ?? raw.visual_identity,
    raw.clothing,
    raw.appearance_details,
  );
  return {
    id: raw.id,
    user_id: raw.user_id,
    name: raw.name,
    description: raw.description ?? '',
    visual_identity: raw.visual_identity || flattenVisualIdentity(structured),
    visual_identity_structured: structured,
    clothing: raw.clothing ?? structured.clothing ?? '',
    appearance_details: raw.appearance_details ?? structured.distinctive_features ?? '',
    screenplay_character_id: raw.screenplay_character_id ?? null,
    role: raw.role ?? '',
    age_range: raw.age_range ?? '',
    continuity_rules: raw.continuity_rules ?? '',
    reference_image_prompt: raw.reference_image_prompt ?? '',
    voice_description: raw.voice_description ?? '',
    dialogue_style: raw.dialogue_style ?? '',
    in_library: Boolean(raw.in_library),
    primary_reference_asset_id: raw.primary_reference_asset_id ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export class MemoryCharacterRepository implements CharacterRepository {
  private readonly characters = new Map<string, CharacterRecord>();
  private readonly projectLinks = new Map<string, Set<string>>();
  private readonly versions = new Map<string, CharacterVersionRecord[]>();

  constructor(private readonly projects: ProjectRepository) {}

  async listByUser(userId: string): Promise<CharacterRecord[]> {
    return [...this.characters.values()]
      .filter((c) => c.user_id === userId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => structuredClone(hydrateCharacter(c)));
  }

  async listLibrary(userId: string): Promise<CharacterRecord[]> {
    return [...this.characters.values()]
      .filter((c) => c.user_id === userId && c.in_library)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => structuredClone(hydrateCharacter(c)));
  }

  async listByProject(userId: string, projectId: string): Promise<CharacterRecord[]> {
    await this.requireProject(userId, projectId);
    const linked = this.projectLinks.get(projectId) ?? new Set<string>();
    return [...linked]
      .map((id) => this.characters.get(id))
      .filter((c): c is CharacterRecord => c !== undefined && c.user_id === userId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => structuredClone(hydrateCharacter(c)));
  }

  async getById(userId: string, characterId: string): Promise<CharacterRecord | null> {
    const existing = this.characters.get(characterId);
    if (!existing || existing.user_id !== userId) return null;
    return structuredClone(hydrateCharacter(existing));
  }

  async create(userId: string, input: CreateCharacterInput): Promise<CharacterRecord> {
    const timestamp = nowIso();
    const structured = mergeVisualIdentity(input);
    const character: CharacterRecord = {
      id: randomUUID(),
      user_id: userId,
      name: input.name.trim(),
      description: input.description.trim(),
      visual_identity: flattenVisualIdentity(structured),
      visual_identity_structured: structured,
      clothing: input.clothing?.trim() ?? structured.clothing,
      appearance_details:
        input.appearance_details?.trim() ?? structured.distinctive_features,
      screenplay_character_id: input.screenplay_character_id?.trim() || null,
      role: input.role?.trim() ?? '',
      age_range: input.age_range?.trim() ?? '',
      continuity_rules: input.continuity_rules?.trim() ?? '',
      reference_image_prompt: input.reference_image_prompt?.trim() ?? '',
      voice_description: input.voice_description?.trim() ?? '',
      dialogue_style: input.dialogue_style?.trim() ?? '',
      in_library: Boolean(input.in_library),
      primary_reference_asset_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.characters.set(character.id, character);
    this.pushVersion(character, userId, 'Created');
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
    const structured = mergeVisualIdentity(input, existing.visual_identity_structured);
    const updated: CharacterRecord = {
      ...hydrateCharacter(existing),
      name: input.name?.trim() ?? existing.name,
      description: input.description?.trim() ?? existing.description,
      visual_identity: flattenVisualIdentity(structured),
      visual_identity_structured: structured,
      clothing: input.clothing?.trim() ?? structured.clothing,
      appearance_details:
        input.appearance_details?.trim() ?? structured.distinctive_features,
      screenplay_character_id:
        input.screenplay_character_id !== undefined
          ? input.screenplay_character_id?.trim() || null
          : existing.screenplay_character_id,
      role: input.role?.trim() ?? existing.role,
      age_range: input.age_range?.trim() ?? existing.age_range,
      continuity_rules: input.continuity_rules?.trim() ?? existing.continuity_rules,
      reference_image_prompt:
        input.reference_image_prompt?.trim() ?? existing.reference_image_prompt,
      voice_description: input.voice_description?.trim() ?? existing.voice_description,
      dialogue_style: input.dialogue_style?.trim() ?? existing.dialogue_style,
      in_library: input.in_library ?? existing.in_library,
      primary_reference_asset_id:
        input.primary_reference_asset_id !== undefined
          ? input.primary_reference_asset_id
          : existing.primary_reference_asset_id,
      updated_at: nowIso(),
    };
    this.characters.set(characterId, updated);
    this.pushVersion(updated, userId, input.version_note ?? 'Updated');
    return structuredClone(updated);
  }

  async delete(userId: string, characterId: string): Promise<void> {
    const existing = this.characters.get(characterId);
    if (!existing || existing.user_id !== userId) {
      throw new Error('Character not found');
    }
    this.characters.delete(characterId);
    this.versions.delete(characterId);
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

  async saveToLibrary(userId: string, characterId: string): Promise<CharacterRecord> {
    return this.update(userId, characterId, {
      in_library: true,
      version_note: 'Saved to reusable library',
    });
  }

  async reuseLibraryCharacter(
    userId: string,
    projectId: string,
    libraryCharacterId: string,
    screenplayCharacterId?: string,
  ): Promise<CharacterRecord> {
    const libraryCharacter = await this.getById(userId, libraryCharacterId);
    if (!libraryCharacter || !libraryCharacter.in_library) {
      throw new Error('Library character not found');
    }
    await this.linkToProject(userId, projectId, libraryCharacterId);
    if (screenplayCharacterId) {
      return this.update(userId, libraryCharacterId, {
        screenplay_character_id: screenplayCharacterId,
        version_note: 'Linked to project from library',
      });
    }
    return libraryCharacter;
  }

  async listVersions(userId: string, characterId: string): Promise<CharacterVersionRecord[]> {
    const existing = this.characters.get(characterId);
    if (!existing || existing.user_id !== userId) {
      throw new Error('Character not found');
    }
    return structuredClone(this.versions.get(characterId) ?? []);
  }

  async listProjectIdsForCharacter(userId: string, characterId: string): Promise<string[]> {
    const existing = this.characters.get(characterId);
    if (!existing || existing.user_id !== userId) {
      throw new Error('Character not found');
    }
    const projectIds: string[] = [];
    for (const [projectId, links] of this.projectLinks.entries()) {
      if (links.has(characterId)) projectIds.push(projectId);
    }
    return projectIds.sort();
  }

  clear(): void {
    this.characters.clear();
    this.projectLinks.clear();
    this.versions.clear();
  }

  exportAll(): {
    characters: CharacterRecord[];
    projectLinks: Array<{ projectId: string; characterIds: string[] }>;
    versions: CharacterVersionRecord[];
  } {
    return {
      characters: [...this.characters.values()].map((character) =>
        structuredClone(hydrateCharacter(character)),
      ),
      projectLinks: [...this.projectLinks.entries()].map(([projectId, characterIds]) => ({
        projectId,
        characterIds: [...characterIds],
      })),
      versions: [...this.versions.values()].flat().map((version) => structuredClone(version)),
    };
  }

  importAll(input: {
    characters: CharacterRecord[];
    projectLinks: Array<{ projectId: string; characterIds: string[] }>;
    versions?: CharacterVersionRecord[];
  }): void {
    this.characters.clear();
    this.projectLinks.clear();
    this.versions.clear();
    for (const character of input.characters) {
      this.characters.set(character.id, hydrateCharacter(character));
    }
    for (const link of input.projectLinks) {
      this.projectLinks.set(link.projectId, new Set(link.characterIds));
    }
    for (const version of input.versions ?? []) {
      const list = this.versions.get(version.character_id) ?? [];
      list.push(structuredClone(version));
      this.versions.set(version.character_id, list);
    }
  }

  private pushVersion(
    character: CharacterRecord,
    userId: string,
    note: string,
  ): void {
    const list = this.versions.get(character.id) ?? [];
    list.push({
      id: randomUUID(),
      character_id: character.id,
      version_number: list.length + 1,
      name: character.name,
      description: character.description,
      visual_identity: character.visual_identity,
      visual_identity_structured:
        character.visual_identity_structured ?? EMPTY_VISUAL_IDENTITY,
      clothing: character.clothing,
      appearance_details: character.appearance_details,
      role: character.role,
      age_range: character.age_range,
      continuity_rules: character.continuity_rules,
      reference_image_prompt: character.reference_image_prompt,
      voice_description: character.voice_description,
      dialogue_style: character.dialogue_style,
      created_at: nowIso(),
      created_by: userId,
      note,
    });
    this.versions.set(character.id, list);
  }

  private async requireProject(userId: string, projectId: string) {
    const project = await this.projects.getById(userId, projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    return project;
  }
}
