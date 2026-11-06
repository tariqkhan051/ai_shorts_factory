'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import {
  afterKnowledgeEngineMutation,
  getAutonomousKnowledgeEngine,
  getKnowledgeEngineStore,
} from '@/lib/knowledge-engine/runtime';

export type KnowledgeEngineActionState = {
  ok: boolean;
  message?: string;
  errors?: string[];
  heroesUpserted?: number;
  itemsUpserted?: number;
  patchesDetected?: number;
  duplicatesSkipped?: number;
  limitations?: string[];
};

export async function activateKnowledgeEngineAction(): Promise<KnowledgeEngineActionState> {
  try {
    const user = await requireUser();
    const engine = await getAutonomousKnowledgeEngine();
    engine.activate(user.id);
    await afterKnowledgeEngineMutation();
    revalidatePath('/game-knowledge');
    return {
      ok: true,
      message: 'Knowledge Engine activated. Initial ingestion queued — run Sync now or the scheduler.',
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Activation failed',
    };
  }
}

export async function syncKnowledgeEngineNowAction(): Promise<KnowledgeEngineActionState> {
  try {
    const user = await requireUser();
    const engine = await getAutonomousKnowledgeEngine();
    const result = await engine.syncNow(user.id, 'manual_sync');
    await afterKnowledgeEngineMutation();
    revalidatePath('/game-knowledge');
    return {
      ok: result.status === 'succeeded',
      message:
        result.status === 'succeeded'
          ? `Sync complete — heroes ${result.heroes_upserted}, items ${result.items_upserted}, patches ${result.patches_detected}`
          : `Sync finished with status ${result.status}`,
      errors: result.errors,
      heroesUpserted: result.heroes_upserted,
      itemsUpserted: result.items_upserted,
      patchesDetected: result.patches_detected,
      duplicatesSkipped: result.duplicates_skipped,
      limitations: result.limitations,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Sync failed',
    };
  }
}

export async function runPatchMonitorAction(): Promise<KnowledgeEngineActionState> {
  try {
    const user = await requireUser();
    const engine = await getAutonomousKnowledgeEngine();
    const result = await engine.syncNow(user.id, 'patch_monitor');
    await afterKnowledgeEngineMutation();
    revalidatePath('/game-knowledge');
    return {
      ok: result.status === 'succeeded',
      message: `Patch monitor — detected ${result.patches_detected}, skipped ${result.duplicates_skipped}`,
      errors: result.errors,
      patchesDetected: result.patches_detected,
      duplicatesSkipped: result.duplicates_skipped,
      limitations: result.limitations,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Patch monitor failed',
    };
  }
}

export async function retryFailedKnowledgeJobsAction(): Promise<KnowledgeEngineActionState> {
  try {
    const user = await requireUser();
    const engine = await getAutonomousKnowledgeEngine();
    const results = await engine.retryFailed(user.id);
    await afterKnowledgeEngineMutation();
    revalidatePath('/game-knowledge');
    return {
      ok: true,
      message: `Retried ${results.length} failed job(s)`,
      limitations: results.flatMap((r) => r.limitations),
      errors: results.flatMap((r) => r.errors),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Retry failed',
    };
  }
}

export async function toggleKnowledgeSourceAction(
  sourceKey: string,
  enabled: boolean,
): Promise<KnowledgeEngineActionState> {
  try {
    const user = await requireUser();
    const store = await getKnowledgeEngineStore();
    const updated = store.setSourceEnabled(user.id, sourceKey, enabled);
    if (!updated) {
      return { ok: false, message: `Source ${sourceKey} not found` };
    }
    await afterKnowledgeEngineMutation();
    revalidatePath('/game-knowledge');
    return {
      ok: true,
      message: `${sourceKey} ${enabled ? 'enabled' : 'disabled'}`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Toggle failed',
    };
  }
}
