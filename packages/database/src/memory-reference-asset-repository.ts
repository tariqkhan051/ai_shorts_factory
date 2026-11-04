import { randomUUID } from 'node:crypto';
import type {
  CreateReferenceAssetInput,
  ReferenceAssetRecord,
  ReferenceAssetRepository,
  CharacterRepository,
} from './story-types.js';

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryReferenceAssetRepository implements ReferenceAssetRepository {
  private readonly assets = new Map<string, ReferenceAssetRecord>();

  constructor(private readonly characters: CharacterRepository) {}

  async listByCharacter(userId: string, characterId: string): Promise<ReferenceAssetRecord[]> {
    const character = await this.characters.getById(userId, characterId);
    if (!character) throw new Error('Character not found');
    return [...this.assets.values()]
      .filter(
        (asset) =>
          asset.user_id === userId &&
          asset.character_id === characterId &&
          !asset.removed_at,
      )
      .sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return b.created_at.localeCompare(a.created_at);
      })
      .map((asset) => structuredClone(asset));
  }

  async getById(userId: string, assetId: string): Promise<ReferenceAssetRecord | null> {
    const asset = this.assets.get(assetId);
    if (!asset || asset.user_id !== userId || asset.removed_at) return null;
    return structuredClone(asset);
  }

  async create(userId: string, input: CreateReferenceAssetInput): Promise<ReferenceAssetRecord> {
    const character = await this.characters.getById(userId, input.characterId);
    if (!character) throw new Error('Character not found');

    const makePrimary = input.isPrimary !== false;
    if (makePrimary) {
      for (const asset of this.assets.values()) {
        if (
          asset.user_id === userId &&
          asset.character_id === input.characterId &&
          !asset.removed_at
        ) {
          asset.is_primary = false;
        }
      }
    }

    const record: ReferenceAssetRecord = {
      id: randomUUID(),
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
      created_at: nowIso(),
      removed_at: null,
    };
    this.assets.set(record.id, record);

    if (makePrimary) {
      await this.characters.update(userId, input.characterId, {
        primary_reference_asset_id: record.id,
        version_note: 'Primary reference image set',
      });
    }

    return structuredClone(record);
  }

  async setPrimary(
    userId: string,
    characterId: string,
    assetId: string,
  ): Promise<ReferenceAssetRecord> {
    const asset = this.assets.get(assetId);
    if (!asset || asset.user_id !== userId || asset.character_id !== characterId || asset.removed_at) {
      throw new Error('Reference asset not found');
    }
    for (const row of this.assets.values()) {
      if (row.user_id === userId && row.character_id === characterId && !row.removed_at) {
        row.is_primary = row.id === assetId;
      }
    }
    await this.characters.update(userId, characterId, {
      primary_reference_asset_id: assetId,
      version_note: 'Primary reference image changed',
    });
    return structuredClone(asset);
  }

  async remove(userId: string, assetId: string): Promise<void> {
    const asset = this.assets.get(assetId);
    if (!asset || asset.user_id !== userId || asset.removed_at) {
      throw new Error('Reference asset not found');
    }
    asset.removed_at = nowIso();
    asset.is_primary = false;
    if (asset.character_id) {
      const remaining = await this.listByCharacter(userId, asset.character_id);
      const nextPrimary = remaining[0] ?? null;
      await this.characters.update(userId, asset.character_id, {
        primary_reference_asset_id: nextPrimary?.id ?? null,
        version_note: 'Reference image removed',
      });
      if (nextPrimary) {
        nextPrimary.is_primary = true;
        this.assets.set(nextPrimary.id, { ...this.assets.get(nextPrimary.id)!, is_primary: true });
      }
    }
  }

  clear(): void {
    this.assets.clear();
  }

  exportAll(): ReferenceAssetRecord[] {
    return [...this.assets.values()].map((asset) => structuredClone(asset));
  }

  importAll(assets: ReferenceAssetRecord[]): void {
    this.assets.clear();
    for (const asset of assets) {
      this.assets.set(asset.id, structuredClone(asset));
    }
  }
}
