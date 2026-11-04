import type { SupabaseClient } from '@supabase/supabase-js';
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

export class SupabaseCharacterRepository implements CharacterRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly projects: ProjectRepository,
  ) {}

  async listByUser(userId: string): Promise<CharacterRecord[]> {
    const { data, error } = await this.client
      .from('characters')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });
    if (error) {
      throw new Error(`Failed to list characters: ${error.message}`);
    }
    return (data ?? []).map(mapCharacter);
  }

  async listLibrary(userId: string): Promise<CharacterRecord[]> {
    const { data, error } = await this.client
      .from('characters')
      .select('*')
      .eq('user_id', userId)
      .eq('in_library', true)
      .order('name', { ascending: true });
    if (error) {
      throw new Error(`Failed to list library characters: ${error.message}`);
    }
    return (data ?? []).map(mapCharacter);
  }

  async listByProject(userId: string, projectId: string): Promise<CharacterRecord[]> {
    await this.requireProject(userId, projectId);
    const { data, error } = await this.client
      .from('project_characters')
      .select('character_id, characters(*)')
      .eq('project_id', projectId);
    if (error) {
      throw new Error(`Failed to list project characters: ${error.message}`);
    }

    return (data ?? [])
      .map((row) => {
        const character = Array.isArray(row.characters) ? row.characters[0] : row.characters;
        return character ? mapCharacter(character) : null;
      })
      .filter((c): c is CharacterRecord => c !== null && c.user_id === userId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getById(userId: string, characterId: string): Promise<CharacterRecord | null> {
    const { data, error } = await this.client
      .from('characters')
      .select('*')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to load character: ${error.message}`);
    }
    return data ? mapCharacter(data) : null;
  }

  async create(userId: string, input: CreateCharacterInput): Promise<CharacterRecord> {
    const structured = mergeVisualIdentity(input);
    const { data, error } = await this.client
      .from('characters')
      .insert({
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
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to create character: ${error?.message ?? 'unknown error'}`);
    }
    const character = mapCharacter(data);
    await this.insertVersion(userId, character, 'Created');
    return character;
  }

  async update(
    userId: string,
    characterId: string,
    input: UpdateCharacterInput,
  ): Promise<CharacterRecord> {
    const existing = await this.getById(userId, characterId);
    if (!existing) throw new Error('Character not found');
    const structured = mergeVisualIdentity(input, existing.visual_identity_structured);
    const patch: Record<string, unknown> = {
      visual_identity: flattenVisualIdentity(structured),
      visual_identity_structured: structured,
    };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.description !== undefined) patch.description = input.description.trim();
    if (input.clothing !== undefined) patch.clothing = input.clothing.trim();
    else patch.clothing = structured.clothing;
    if (input.appearance_details !== undefined) {
      patch.appearance_details = input.appearance_details.trim();
    } else {
      patch.appearance_details = structured.distinctive_features;
    }
    if (input.screenplay_character_id !== undefined) {
      patch.screenplay_character_id = input.screenplay_character_id?.trim() || null;
    }
    if (input.role !== undefined) patch.role = input.role.trim();
    if (input.age_range !== undefined) patch.age_range = input.age_range.trim();
    if (input.continuity_rules !== undefined) patch.continuity_rules = input.continuity_rules.trim();
    if (input.reference_image_prompt !== undefined) {
      patch.reference_image_prompt = input.reference_image_prompt.trim();
    }
    if (input.voice_description !== undefined) {
      patch.voice_description = input.voice_description.trim();
    }
    if (input.dialogue_style !== undefined) patch.dialogue_style = input.dialogue_style.trim();
    if (input.in_library !== undefined) patch.in_library = input.in_library;
    if (input.primary_reference_asset_id !== undefined) {
      patch.primary_reference_asset_id = input.primary_reference_asset_id;
    }

    const { data, error } = await this.client
      .from('characters')
      .update(patch)
      .eq('id', characterId)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to update character: ${error?.message ?? 'unknown error'}`);
    }
    const character = mapCharacter(data);
    await this.insertVersion(userId, character, input.version_note ?? 'Updated');
    return character;
  }

  async delete(userId: string, characterId: string): Promise<void> {
    const { error } = await this.client
      .from('characters')
      .delete()
      .eq('id', characterId)
      .eq('user_id', userId);
    if (error) {
      throw new Error(`Failed to delete character: ${error.message}`);
    }
  }

  async linkToProject(userId: string, projectId: string, characterId: string): Promise<void> {
    await this.requireProject(userId, projectId);
    const { error } = await this.client.from('project_characters').upsert({
      project_id: projectId,
      character_id: characterId,
    });
    if (error) {
      throw new Error(`Failed to link character: ${error.message}`);
    }
  }

  async unlinkFromProject(userId: string, projectId: string, characterId: string): Promise<void> {
    await this.requireProject(userId, projectId);
    const { error } = await this.client
      .from('project_characters')
      .delete()
      .eq('project_id', projectId)
      .eq('character_id', characterId);
    if (error) {
      throw new Error(`Failed to unlink character: ${error.message}`);
    }
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
    const existing = await this.getById(userId, characterId);
    if (!existing) throw new Error('Character not found');
    const { data, error } = await this.client
      .from('character_versions')
      .select('*')
      .eq('character_id', characterId)
      .order('version_number', { ascending: true });
    if (error) {
      throw new Error(`Failed to list character versions: ${error.message}`);
    }
    return (data ?? []).map(mapVersion);
  }

  async listProjectIdsForCharacter(userId: string, characterId: string): Promise<string[]> {
    const existing = await this.getById(userId, characterId);
    if (!existing) throw new Error('Character not found');
    const { data, error } = await this.client
      .from('project_characters')
      .select('project_id')
      .eq('character_id', characterId);
    if (error) {
      throw new Error(`Failed to list character projects: ${error.message}`);
    }
    return (data ?? []).map((row) => String(row.project_id)).sort();
  }

  private async insertVersion(
    userId: string,
    character: CharacterRecord,
    note: string,
  ): Promise<void> {
    const { count } = await this.client
      .from('character_versions')
      .select('*', { count: 'exact', head: true })
      .eq('character_id', character.id);
    await this.client.from('character_versions').insert({
      character_id: character.id,
      version_number: (count ?? 0) + 1,
      name: character.name,
      description: character.description,
      visual_identity: character.visual_identity,
      visual_identity_structured: character.visual_identity_structured,
      clothing: character.clothing,
      appearance_details: character.appearance_details,
      role: character.role,
      age_range: character.age_range,
      continuity_rules: character.continuity_rules,
      reference_image_prompt: character.reference_image_prompt,
      voice_description: character.voice_description,
      dialogue_style: character.dialogue_style,
      created_by: userId,
      note,
    });
  }

  private async requireProject(userId: string, projectId: string) {
    const project = await this.projects.getById(userId, projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    return project;
  }
}

function mapCharacter(row: Record<string, unknown>): CharacterRecord {
  const structured = normalizeStoredVisualIdentity(
    row.visual_identity_structured ?? row.visual_identity,
    String(row.clothing ?? ''),
    String(row.appearance_details ?? ''),
  );
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    description: String(row.description ?? ''),
    visual_identity: String(row.visual_identity ?? flattenVisualIdentity(structured)),
    visual_identity_structured: structured,
    clothing: String(row.clothing ?? structured.clothing),
    appearance_details: String(row.appearance_details ?? structured.distinctive_features),
    screenplay_character_id: (row.screenplay_character_id as string | null) ?? null,
    role: String(row.role ?? ''),
    age_range: String(row.age_range ?? ''),
    continuity_rules: String(row.continuity_rules ?? ''),
    reference_image_prompt: String(row.reference_image_prompt ?? ''),
    voice_description: String(row.voice_description ?? ''),
    dialogue_style: String(row.dialogue_style ?? ''),
    in_library: Boolean(row.in_library),
    primary_reference_asset_id: (row.primary_reference_asset_id as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapVersion(row: Record<string, unknown>): CharacterVersionRecord {
  return {
    id: String(row.id),
    character_id: String(row.character_id),
    version_number: Number(row.version_number),
    name: String(row.name),
    description: String(row.description ?? ''),
    visual_identity: String(row.visual_identity ?? ''),
    visual_identity_structured: normalizeStoredVisualIdentity(
      row.visual_identity_structured ?? row.visual_identity,
    ),
    clothing: String(row.clothing ?? ''),
    appearance_details: String(row.appearance_details ?? ''),
    role: String(row.role ?? ''),
    age_range: String(row.age_range ?? ''),
    continuity_rules: String(row.continuity_rules ?? ''),
    reference_image_prompt: String(row.reference_image_prompt ?? ''),
    voice_description: String(row.voice_description ?? ''),
    dialogue_style: String(row.dialogue_style ?? ''),
    created_at: String(row.created_at),
    created_by: (row.created_by as string | null) ?? null,
    note: String(row.note ?? ''),
  };
}

export { EMPTY_VISUAL_IDENTITY };
