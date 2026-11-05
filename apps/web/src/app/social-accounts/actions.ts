'use server';

import { revalidatePath } from 'next/cache';
import { createSocialAccountSchema } from '@ai-shorts-factory/validation';
import { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import {
  getSocialAccountRepository,
  persistMemoryStudioNow,
} from '@/lib/projects/repository';

export type SocialActionState = {
  ok: boolean;
  message?: string;
  errors?: string[];
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createSocialAccountAction(
  _prev: SocialActionState,
  formData: FormData,
): Promise<SocialActionState> {
  try {
    const user = await requireUser();
    const payload = createSocialAccountSchema.parse({
      platform: formString(formData, 'platform'),
      display_name: formString(formData, 'display_name'),
      handle: formString(formData, 'handle'),
      brand_id: formString(formData, 'brand_id') || undefined,
      default_caption_rules: formString(formData, 'default_caption_rules'),
      default_hashtag_rules: formString(formData, 'default_hashtag_rules'),
      default_content_format: formString(formData, 'default_content_format') || '9:16',
    });
    const repo = await getSocialAccountRepository();
    await repo.create(user.id, payload);
    await persistMemoryStudioNow();
    revalidatePath('/social-accounts');
    revalidatePath('/brands');
    return {
      ok: true,
      message:
        'Account registered. Connection status stays “registered” until an authorized publishing integration connects.',
    };
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
      message: error instanceof Error ? error.message : 'Failed to register account',
    };
  }
}

export async function linkSocialAccountToProjectAction(
  projectId: string,
  socialAccountId: string,
  isDefault = false,
): Promise<void> {
  const user = await requireUser();
  const repo = await getSocialAccountRepository();
  await repo.linkToProject(user.id, projectId, socialAccountId, isDefault);
  await persistMemoryStudioNow();
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/social-accounts');
}
