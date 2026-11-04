import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectRepository } from './types.js';
import type {
  CharacterRecord,
  CharacterRepository,
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

  async create(userId: string, input: CreateCharacterInput): Promise<CharacterRecord> {
    const { data, error } = await this.client
      .from('characters')
      .insert({
        user_id: userId,
        name: input.name.trim(),
        description: input.description.trim(),
        visual_identity: input.visual_identity.trim(),
        clothing: input.clothing?.trim() ?? '',
        appearance_details: input.appearance_details?.trim() ?? '',
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to create character: ${error?.message ?? 'unknown error'}`);
    }
    return mapCharacter(data);
  }

  async update(
    userId: string,
    characterId: string,
    input: UpdateCharacterInput,
  ): Promise<CharacterRecord> {
    const patch: Record<string, string> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.description !== undefined) patch.description = input.description.trim();
    if (input.visual_identity !== undefined) patch.visual_identity = input.visual_identity.trim();
    if (input.clothing !== undefined) patch.clothing = input.clothing.trim();
    if (input.appearance_details !== undefined) {
      patch.appearance_details = input.appearance_details.trim();
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
    return mapCharacter(data);
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

  private async requireProject(userId: string, projectId: string) {
    const project = await this.projects.getById(userId, projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    return project;
  }
}

function mapCharacter(row: Record<string, unknown>): CharacterRecord {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    description: String(row.description ?? ''),
    visual_identity: String(row.visual_identity ?? ''),
    clothing: String(row.clothing ?? ''),
    appearance_details: String(row.appearance_details ?? ''),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
