'use server';

import { revalidatePath } from 'next/cache';
import {
  importGameKnowledgeAsDraft,
  previewGameKnowledgeImport,
  publishGameKnowledgeWithConfirmation,
} from '@ai-shorts-factory/database';
import { PUBLISH_GAME_KNOWLEDGE_PHRASE } from '@ai-shorts-factory/shared-types';
import { requireUser } from '@/lib/auth';
import {
  getGameKnowledgeRepository,
  persistGameKnowledgeNow,
  scheduleGameKnowledgePersist,
} from '@/lib/projects/repository';

export type GameKnowledgeActionState = {
  ok: boolean;
  message?: string;
  errors?: string[];
  warnings?: string[];
  diffSummary?: string;
  draftPatchId?: string;
};

export async function previewGameKnowledgeAction(
  _prev: GameKnowledgeActionState,
  formData: FormData,
): Promise<GameKnowledgeActionState> {
  try {
    const user = await requireUser();
    const raw = String(formData.get('json') ?? '');
    const knowledge = await getGameKnowledgeRepository();
    const preview = await previewGameKnowledgeImport(knowledge, user.id, raw);
    if (!preview.ok) {
      return { ok: false, errors: preview.errors, message: 'Import validation failed' };
    }
    return {
      ok: true,
      message: 'Preview only — nothing written. Use Import as draft to persist.',
      warnings: preview.warnings,
      diffSummary: preview.diff.summary,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Preview failed',
    };
  }
}

export async function importGameKnowledgeDraftAction(
  _prev: GameKnowledgeActionState,
  formData: FormData,
): Promise<GameKnowledgeActionState> {
  try {
    const user = await requireUser();
    const raw = String(formData.get('json') ?? '');
    const knowledge = await getGameKnowledgeRepository();
    const imported = await importGameKnowledgeAsDraft(knowledge, user.id, raw);
    if (!imported.ok) {
      return { ok: false, errors: imported.errors, message: 'Draft import failed' };
    }
    scheduleGameKnowledgePersist();
    await persistGameKnowledgeNow();
    revalidatePath('/game-knowledge');
    return {
      ok: true,
      message: `Draft patch ${imported.result.draft_patch.patch_code} saved (${imported.result.draft_patch.server_environment}). Not published.`,
      warnings: imported.result.warnings,
      diffSummary: imported.result.diff.summary,
      draftPatchId: imported.result.draft_patch.id,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Draft import failed',
    };
  }
}

export async function publishGameKnowledgeAction(
  _prev: GameKnowledgeActionState,
  formData: FormData,
): Promise<GameKnowledgeActionState> {
  try {
    const user = await requireUser();
    const patchId = String(formData.get('patch_id') ?? '');
    const phrase = String(formData.get('confirm_phrase') ?? '');
    const knowledge = await getGameKnowledgeRepository();
    const published = await publishGameKnowledgeWithConfirmation(
      knowledge,
      user.id,
      patchId,
      phrase,
    );
    scheduleGameKnowledgePersist();
    await persistGameKnowledgeNow();
    revalidatePath('/game-knowledge');
    return {
      ok: true,
      message: `Published ${published.patch_code} (${published.server_environment}).`,
      draftPatchId: published.id,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Publish failed',
      errors:
        String(formData.get('confirm_phrase') ?? '') !== PUBLISH_GAME_KNOWLEDGE_PHRASE
          ? [`Type ${PUBLISH_GAME_KNOWLEDGE_PHRASE} exactly to publish.`]
          : undefined,
    };
  }
}
