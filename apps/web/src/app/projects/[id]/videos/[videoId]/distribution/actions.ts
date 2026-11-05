'use server';

import { revalidatePath } from 'next/cache';
import { createDistributionSchema, updateDistributionSchema } from '@ai-shorts-factory/validation';
import { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import {
  getDistributionRepository,
  getSocialAccountRepository,
  persistMemoryStudioNow,
} from '@/lib/projects/repository';

export type DistributionActionState = {
  ok: boolean;
  message?: string;
  errors?: string[];
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createDistributionAction(
  projectId: string,
  videoId: string,
  _prev: DistributionActionState,
  formData: FormData,
): Promise<DistributionActionState> {
  try {
    const user = await requireUser();
    const socialAccountId = formString(formData, 'social_account_id');
    const social = await getSocialAccountRepository();
    const account = await social.getById(user.id, socialAccountId);
    if (!account) return { ok: false, message: 'Social account not found' };

    const payload = createDistributionSchema.parse({
      social_account_id: socialAccountId,
      platform: account.platform,
      target_format: formString(formData, 'target_format') || account.default_content_format,
      caption: formString(formData, 'caption'),
      hashtags: formString(formData, 'hashtags')
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean),
    });

    const distributions = await getDistributionRepository();
    await distributions.create(user.id, videoId, projectId, {
      ...payload,
      platform: account.platform,
    });
    await persistMemoryStudioNow();
    revalidatePath(`/projects/${projectId}/videos/${videoId}/distribution`);
    return { ok: true, message: 'Distribution destination added' };
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
      message: error instanceof Error ? error.message : 'Failed to create distribution',
    };
  }
}

export async function confirmManualPublishAction(
  projectId: string,
  videoId: string,
  distributionId: string,
  _prev: DistributionActionState,
  formData: FormData,
): Promise<DistributionActionState> {
  try {
    const user = await requireUser();
    const payload = updateDistributionSchema.parse({
      confirm_manual_publish: true,
      published_url: formString(formData, 'published_url') || null,
      platform_reference_id: formString(formData, 'platform_reference_id') || null,
    });
    const distributions = await getDistributionRepository();
    await distributions.update(user.id, distributionId, payload);
    await persistMemoryStudioNow();
    revalidatePath(`/projects/${projectId}/videos/${videoId}/distribution`);
    return { ok: true, message: 'Marked as manually published' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to confirm publish',
    };
  }
}

export async function linkAccountAndCreateDefaultAction(
  projectId: string,
  socialAccountId: string,
): Promise<void> {
  const user = await requireUser();
  const social = await getSocialAccountRepository();
  await social.linkToProject(user.id, projectId, socialAccountId, false);
  await persistMemoryStudioNow();
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/social-accounts');
}
