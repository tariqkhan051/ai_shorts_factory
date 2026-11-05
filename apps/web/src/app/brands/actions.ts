'use server';

import { revalidatePath } from 'next/cache';
import { createBrandSchema } from '@ai-shorts-factory/validation';
import { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import { getBrandRepository, persistMemoryStudioNow } from '@/lib/projects/repository';

export type BrandActionState = {
  ok: boolean;
  message?: string;
  errors?: string[];
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createBrandAction(
  _prev: BrandActionState,
  formData: FormData,
): Promise<BrandActionState> {
  try {
    const user = await requireUser();
    const payload = createBrandSchema.parse({
      name: formString(formData, 'name'),
      description: formString(formData, 'description'),
      target_audience: formString(formData, 'target_audience'),
      brand_voice: formString(formData, 'brand_voice'),
    });
    const brands = await getBrandRepository();
    await brands.create(user.id, payload);
    await persistMemoryStudioNow();
    revalidatePath('/brands');
    return { ok: true, message: 'Brand created' };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        message: 'Validation failed',
        errors: error.issues.map((i) => i.message),
      };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to create brand',
    };
  }
}
