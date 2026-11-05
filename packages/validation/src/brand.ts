import { z } from 'zod';

export const brandColorsSchema = z.object({
  primary: z.string().trim().max(32).default(''),
  secondary: z.string().trim().max(32).default(''),
  accent: z.string().trim().max(32).default(''),
  extra: z.array(z.string().trim().max(32)).max(12).default([]),
});

export const createBrandSchema = z.object({
  name: z.string().trim().min(1, 'Brand name is required').max(120),
  description: z.string().trim().max(4000).default(''),
  logo_asset_id: z.string().uuid().nullable().optional(),
  colors: brandColorsSchema.default({}),
  default_watermark_asset_id: z.string().uuid().nullable().optional(),
  target_audience: z.string().trim().max(240).default(''),
  brand_voice: z.string().trim().max(4000).default(''),
});

export const updateBrandSchema = createBrandSchema.partial();

export type BrandColors = z.infer<typeof brandColorsSchema>;
/** Input shape for creates (defaults applied by Zod parse). */
export type CreateBrandPayload = z.input<typeof createBrandSchema>;
export type UpdateBrandPayload = z.input<typeof updateBrandSchema>;

export function parseCreateBrand(input: unknown): CreateBrandPayload {
  return createBrandSchema.parse(input);
}

export function parseUpdateBrand(input: unknown): UpdateBrandPayload {
  return updateBrandSchema.parse(input);
}
