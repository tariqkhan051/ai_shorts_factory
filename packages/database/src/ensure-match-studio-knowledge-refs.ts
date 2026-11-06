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

  // Best-effort hero/ability mirror so Match Studio Supabase reads can resolve catalog rows.
  // Full Autonomous Knowledge Engine catalogs use migration 00015 tables via service role.
  const heroes = await knowledge.listHeroes(userId, patch.id);
  for (const hero of heroes) {
    const { error: heroError } = await client.from('hero_knowledge').upsert(
      {
        id: hero.id,
        game_patch_id: hero.game_patch_id,
        hero_key: hero.hero_key,
        name: hero.name,
        aliases: hero.aliases ?? [],
        roles: hero.roles ?? [],
        lanes: hero.lanes ?? [],
        description: hero.description ?? '',
        passive: hero.passive ?? {},
        damage_types: hero.damage_types ?? [],
        cc_types: hero.cc_types ?? [],
        sound_signature_notes: hero.sound_signature_notes ?? '',
        revamp_notes: hero.revamp_notes ?? '',
        portrait_asset_id: hero.portrait_asset_id,
      },
      { onConflict: 'id' },
    );
    if (heroError) {
      throw new Error(`Failed to sync hero ${hero.hero_key} to Supabase: ${heroError.message}`);
    }
    const abilities = await knowledge.listAbilities(userId, hero.id);
    for (const ability of abilities) {
      const { error: abilityError } = await client.from('ability_knowledge').upsert(
        {
          id: ability.id,
          hero_knowledge_id: ability.hero_knowledge_id,
          ability_key: ability.ability_key,
          slot: ability.slot,
          name: ability.name,
          description: ability.description ?? '',
          effects: ability.effects ?? '',
          damage_types: ability.damage_types ?? [],
          cc_types: ability.cc_types ?? [],
          experimental: Boolean(ability.experimental),
        },
        { onConflict: 'id' },
      );
      if (abilityError) {
        throw new Error(
          `Failed to sync ability ${ability.ability_key} to Supabase: ${abilityError.message}`,
        );
      }
    }
  }
}
