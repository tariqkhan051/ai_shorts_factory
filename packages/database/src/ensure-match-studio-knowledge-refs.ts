import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameKnowledgeRepository } from './game-knowledge-types.js';

/**
 * Upserts Memory (or other) Game KB profile/patch rows into Supabase so
 * match_studio_runs FK constraints succeed while full KB remains file/Memory-backed.
 * Idempotent on primary keys.
 */
export async function ensureMatchStudioKnowledgeRefs(
  client: SupabaseClient,
  knowledge: GameKnowledgeRepository,
  userId: string,
  refs: { gameProfileId: string; gamePatchId: string | null },
): Promise<void> {
  const profile = await knowledge.getProfile(userId, refs.gameProfileId);
  if (!profile) {
    throw new Error(
      `Game profile ${refs.gameProfileId} not found in local knowledge store. Import KB before creating Match Studio runs.`,
    );
  }

  const { error: profileError } = await client.from('game_profiles').upsert(
    {
      id: profile.id,
      user_id: userId,
      slug: profile.slug,
      name: profile.name,
      description: profile.description ?? '',
      terminology: profile.terminology ?? {},
      gameplay_rules: profile.gameplay_rules ?? '',
      deleted_at: profile.deleted_at ?? null,
    },
    { onConflict: 'id' },
  );
  if (profileError) {
    throw new Error(`Failed to sync game profile to Supabase: ${profileError.message}`);
  }

  if (!refs.gamePatchId) return;

  const patch = await knowledge.getPatch(userId, refs.gamePatchId);
  if (!patch) {
    throw new Error(`Game patch ${refs.gamePatchId} not found in local knowledge store.`);
  }

  const { error: patchError } = await client.from('game_patches').upsert(
    {
      id: patch.id,
      game_profile_id: patch.game_profile_id,
      server_environment: patch.server_environment,
      patch_code: patch.patch_code,
      title: patch.title,
      effective_from: patch.effective_from,
      effective_to: patch.effective_to,
      status: patch.status,
      notes: patch.notes ?? '',
      previous_patch_id: patch.previous_patch_id,
      published_at: patch.published_at,
      published_by: patch.published_by,
    },
    { onConflict: 'id' },
  );
  if (patchError) {
    throw new Error(`Failed to sync game patch to Supabase: ${patchError.message}`);
  }
}
