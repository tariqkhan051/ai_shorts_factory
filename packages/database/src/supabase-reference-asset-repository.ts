import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CharacterRepository,
  CreateReferenceAssetInput,
  ReferenceAssetRecord,
  ReferenceAssetRepository,
} from './story-types.js';

export class SupabaseReferenceAssetRepository implements ReferenceAssetRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly characters: CharacterRepository,
  ) {}

  async listByCharacter(userId: string, characterId: string): Promise<ReferenceAssetRecord[]> {
    const character = await this.characters.getById(userId, characterId);
    if (!character) throw new Error('Character not found');
    const { data, error } = await this.client
      .from('reference_assets')
      .select('*')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .is('removed_at', null)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      throw new Error(`Failed to list reference assets: ${error.message}`);
    }
    return (data ?? []).map(mapAsset);
  }

  async getById(userId: string, assetId: string): Promise<ReferenceAssetRecord | null> {
    const { data, error } = await this.client
      .from('reference_assets')
      .select('*')
      .eq('id', assetId)
      .eq('user_id', userId)
      .is('removed_at', null)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to load reference asset: ${error.message}`);
    }
    return data ? mapAsset(data) : null;
  }

  async create(userId: string, input: CreateReferenceAssetInput): Promise<ReferenceAssetRecord> {
    const character = await this.characters.getById(userId, input.characterId);
    if (!character) throw new Error('Character not found');
    const makePrimary = input.isPrimary !== false;

    if (makePrimary) {
      await this.client
        .from('reference_assets')
        .update({ is_primary: false })
        .eq('user_id', userId)
        .eq('character_id', input.characterId)
        .is('removed_at', null);
    }

    const { data, error } = await this.client
      .from('reference_assets')
      .insert({
        user_id: userId,
        character_id: input.characterId,
        project_id: input.projectId ?? null,
        storage_key: input.storageKey,
        content_type: input.contentType,
        byte_size: input.byteSize,
        checksum_sha256: input.checksumSha256,
        original_filename: input.originalFilename,
        is_primary: makePrimary,
        notes: input.notes?.trim() ?? '',
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to create reference asset: ${error?.message ?? 'unknown error'}`);
    }

    if (makePrimary) {
      await this.characters.update(userId, input.characterId, {
        primary_reference_asset_id: data.id,
        version_note: 'Primary reference image set',
      });
    }

    return mapAsset(data);
  }

  async setPrimary(
    userId: string,
    characterId: string,
    assetId: string,
  ): Promise<ReferenceAssetRecord> {
    const asset = await this.getById(userId, assetId);
    if (!asset || asset.character_id !== characterId) {
      throw new Error('Reference asset not found');
    }
    await this.client
      .from('reference_assets')
      .update({ is_primary: false })
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .is('removed_at', null);
    const { data, error } = await this.client
      .from('reference_assets')
      .update({ is_primary: true })
      .eq('id', assetId)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to set primary reference: ${error?.message ?? 'unknown error'}`);
    }
    await this.characters.update(userId, characterId, {
      primary_reference_asset_id: assetId,
      version_note: 'Primary reference image changed',
    });
    return mapAsset(data);
  }

  async remove(userId: string, assetId: string): Promise<void> {
    const asset = await this.getById(userId, assetId);
    if (!asset) throw new Error('Reference asset not found');
    const { error } = await this.client
      .from('reference_assets')
      .update({ is_primary: false, removed_at: new Date().toISOString() })
      .eq('id', assetId)
      .eq('user_id', userId);
    if (error) {
      throw new Error(`Failed to remove reference asset: ${error.message}`);
    }
    if (asset.character_id) {
      const remaining = await this.listByCharacter(userId, asset.character_id);
      const nextPrimary = remaining[0] ?? null;
      if (nextPrimary) {
        await this.setPrimary(userId, asset.character_id, nextPrimary.id);
      } else {
        await this.characters.update(userId, asset.character_id, {
          primary_reference_asset_id: null,
          version_note: 'Reference image removed',
        });
      }
    }
  }
}

function mapAsset(row: Record<string, unknown>): ReferenceAssetRecord {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    character_id: (row.character_id as string | null) ?? null,
    project_id: (row.project_id as string | null) ?? null,
    storage_key: String(row.storage_key),
    content_type: String(row.content_type),
    byte_size: Number(row.byte_size),
    checksum_sha256: (row.checksum_sha256 as string | null) ?? null,
    original_filename: (row.original_filename as string | null) ?? null,
    is_primary: Boolean(row.is_primary),
    notes: String(row.notes ?? ''),
    created_at: String(row.created_at),
    removed_at: (row.removed_at as string | null) ?? null,
  };
}
