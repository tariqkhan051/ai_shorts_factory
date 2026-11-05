import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateBrandPayload, UpdateBrandPayload } from '@ai-shorts-factory/validation';
import type { BrandRecord, BrandRepository } from './content-platform-types.js';
import { mapBrandRow } from './content-platform-mappers.js';

const PERSONAL_BRAND_NAME = 'Personal';

export class SupabaseBrandRepository implements BrandRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByUser(userId: string): Promise<BrandRecord[]> {
    const { data, error } = await this.client
      .from('brands')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    if (error) throw new Error(`Failed to list brands: ${error.message}`);
    return (data ?? []).map((row) => mapBrandRow(row));
  }

  async getById(userId: string, brandId: string): Promise<BrandRecord | null> {
    const { data, error } = await this.client
      .from('brands')
      .select('*')
      .eq('id', brandId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(`Failed to load brand: ${error.message}`);
    return data ? mapBrandRow(data) : null;
  }

  async create(userId: string, input: CreateBrandPayload): Promise<BrandRecord> {
    const { data, error } = await this.client
      .from('brands')
      .insert({
        user_id: userId,
        name: input.name,
        description: input.description ?? '',
        logo_asset_id: input.logo_asset_id ?? null,
        colors: input.colors ?? {},
        default_watermark_asset_id: input.default_watermark_asset_id ?? null,
        target_audience: input.target_audience ?? '',
        brand_voice: input.brand_voice ?? '',
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`Failed to create brand: ${error?.message ?? 'unknown'}`);
    return mapBrandRow(data);
  }

  async update(
    userId: string,
    brandId: string,
    input: UpdateBrandPayload,
  ): Promise<BrandRecord> {
    const existing = await this.getById(userId, brandId);
    if (!existing) throw new Error('Brand not found');

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.logo_asset_id !== undefined) patch.logo_asset_id = input.logo_asset_id;
    if (input.colors !== undefined) patch.colors = input.colors;
    if (input.default_watermark_asset_id !== undefined) {
      patch.default_watermark_asset_id = input.default_watermark_asset_id;
    }
    if (input.target_audience !== undefined) patch.target_audience = input.target_audience;
    if (input.brand_voice !== undefined) patch.brand_voice = input.brand_voice;

    const { error } = await this.client
      .from('brands')
      .update(patch)
      .eq('id', brandId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to update brand: ${error.message}`);

    const updated = await this.getById(userId, brandId);
    if (!updated) throw new Error('Brand disappeared after update');
    return updated;
  }

  async softDelete(userId: string, brandId: string): Promise<void> {
    const { error } = await this.client
      .from('brands')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', brandId)
      .eq('user_id', userId)
      .is('deleted_at', null);
    if (error) throw new Error(`Failed to delete brand: ${error.message}`);
  }

  async ensurePersonalBrand(userId: string): Promise<BrandRecord> {
    const existing = (await this.listByUser(userId)).find((b) => b.name === PERSONAL_BRAND_NAME);
    if (existing) return existing;
    return this.create(userId, {
      name: PERSONAL_BRAND_NAME,
      description: 'Default brand for migrated and unassigned projects',
    });
  }
}
