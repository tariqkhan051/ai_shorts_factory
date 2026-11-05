import { randomUUID } from 'node:crypto';
import type { CreateBrandPayload, UpdateBrandPayload } from '@ai-shorts-factory/validation';
import type { BrandRecord, BrandRepository } from './content-platform-types.js';

function nowIso(): string {
  return new Date().toISOString();
}

const PERSONAL_BRAND_NAME = 'Personal';

export class MemoryBrandRepository implements BrandRepository {
  private readonly brands = new Map<string, BrandRecord>();

  async listByUser(userId: string): Promise<BrandRecord[]> {
    return [...this.brands.values()]
      .filter((b) => b.user_id === userId && b.deleted_at === null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getById(userId: string, brandId: string): Promise<BrandRecord | null> {
    const brand = this.brands.get(brandId);
    if (!brand || brand.user_id !== userId || brand.deleted_at) return null;
    return structuredClone(brand);
  }

  async create(userId: string, input: CreateBrandPayload): Promise<BrandRecord> {
    const timestamp = nowIso();
    const brand: BrandRecord = {
      id: randomUUID(),
      user_id: userId,
      name: input.name,
      description: input.description ?? '',
      logo_asset_id: input.logo_asset_id ?? null,
      colors: {
        primary: input.colors?.primary ?? '',
        secondary: input.colors?.secondary ?? '',
        accent: input.colors?.accent ?? '',
        extra: input.colors?.extra ?? [],
      },
      default_watermark_asset_id: input.default_watermark_asset_id ?? null,
      target_audience: input.target_audience ?? '',
      brand_voice: input.brand_voice ?? '',
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    };
    this.brands.set(brand.id, brand);
    return structuredClone(brand);
  }

  async update(
    userId: string,
    brandId: string,
    input: UpdateBrandPayload,
  ): Promise<BrandRecord> {
    const existing = await this.getById(userId, brandId);
    if (!existing) throw new Error('Brand not found');
    const updated: BrandRecord = {
      ...existing,
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      logo_asset_id:
        input.logo_asset_id !== undefined ? input.logo_asset_id : existing.logo_asset_id,
      colors: input.colors
        ? {
            primary: input.colors.primary ?? existing.colors.primary,
            secondary: input.colors.secondary ?? existing.colors.secondary,
            accent: input.colors.accent ?? existing.colors.accent,
            extra: input.colors.extra ?? existing.colors.extra,
          }
        : existing.colors,
      default_watermark_asset_id:
        input.default_watermark_asset_id !== undefined
          ? input.default_watermark_asset_id
          : existing.default_watermark_asset_id,
      target_audience: input.target_audience ?? existing.target_audience,
      brand_voice: input.brand_voice ?? existing.brand_voice,
      updated_at: nowIso(),
    };
    this.brands.set(brandId, updated);
    return structuredClone(updated);
  }

  async softDelete(userId: string, brandId: string): Promise<void> {
    const existing = await this.getById(userId, brandId);
    if (!existing) throw new Error('Brand not found');
    this.brands.set(brandId, {
      ...existing,
      deleted_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  async ensurePersonalBrand(userId: string): Promise<BrandRecord> {
    const existing = (await this.listByUser(userId)).find(
      (b) => b.name === PERSONAL_BRAND_NAME,
    );
    if (existing) return existing;
    return this.create(userId, {
      name: PERSONAL_BRAND_NAME,
      description: 'Default brand for migrated and unassigned projects',
    });
  }

  clear(): void {
    this.brands.clear();
  }

  exportAll(): BrandRecord[] {
    return [...this.brands.values()].map((b) => structuredClone(b));
  }

  importAll(records: BrandRecord[]): void {
    this.brands.clear();
    for (const record of records) {
      this.brands.set(record.id, structuredClone(record));
    }
  }
}
