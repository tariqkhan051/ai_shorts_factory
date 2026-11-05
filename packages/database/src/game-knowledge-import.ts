import { PUBLISH_GAME_KNOWLEDGE_PHRASE } from '@ai-shorts-factory/shared-types';
import {
  formatGameKnowledgeImportErrors,
  safeParseGameKnowledgeImportPackage,
  type GameKnowledgeImportPackageV1,
} from '@ai-shorts-factory/validation';

export { PUBLISH_GAME_KNOWLEDGE_PHRASE } from '@ai-shorts-factory/shared-types';
import {
  diffGameKnowledge,
  snapshotFromImport,
  snapshotFromRecords,
  type GameKnowledgeDiff,
} from './game-knowledge-diff.js';
import { parseGameKnowledgeImportJsonText } from './game-knowledge-import-parse.js';
import type {
  AbilityKnowledgeRecord,
  GameKnowledgeRepository,
  GamePatchRecord,
  GameProfileRecord,
  HeroKnowledgeRecord,
} from './game-knowledge-types.js';

export { parseGameKnowledgeImportJsonText } from './game-knowledge-import-parse.js';

export type GameKnowledgeImportPreview = {
  ok: true;
  package: GameKnowledgeImportPackageV1;
  diff: GameKnowledgeDiff;
  baseline_patch: GamePatchRecord | null;
  warnings: string[];
};

export type GameKnowledgeImportPreviewFailure = {
  ok: false;
  errors: string[];
};

export type GameKnowledgeDraftImportResult = {
  profile: GameProfileRecord;
  draft_patch: GamePatchRecord;
  diff: GameKnowledgeDiff;
  warnings: string[];
  created_new_draft: boolean;
};

async function loadPatchSnapshot(
  knowledge: GameKnowledgeRepository,
  userId: string,
  patch: GamePatchRecord,
) {
  const heroes = await knowledge.listHeroes(userId, patch.id);
  const abilitiesByHeroId = new Map<string, AbilityKnowledgeRecord[]>();
  for (const hero of heroes) {
    abilitiesByHeroId.set(hero.id, await knowledge.listAbilities(userId, hero.id));
  }
  const sources = await knowledge.listKnowledgeSources(userId, patch.id);
  return snapshotFromRecords({
    patchCode: patch.patch_code,
    heroes,
    abilitiesByHeroId,
    sources,
  });
}

async function findBaselinePatch(
  knowledge: GameKnowledgeRepository,
  userId: string,
  profileId: string,
  pkg: GameKnowledgeImportPackageV1,
): Promise<GamePatchRecord | null> {
  const patches = await knowledge.listPatches(
    userId,
    profileId,
    pkg.server_environment,
  );
  if (pkg.patch.previous_patch_code) {
    const named = patches.find((p) => p.patch_code === pkg.patch.previous_patch_code);
    if (named) return named;
  }
  const published = patches
    .filter((p) => p.status === 'published')
    .sort((a, b) => (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at));
  return published[0] ?? null;
}

function collectWarnings(pkg: GameKnowledgeImportPackageV1, diff: GameKnowledgeDiff): string[] {
  const warnings: string[] = [];
  if (diff.is_noop) {
    warnings.push('Incoming package matches baseline; draft will still be created/updated.');
  }
  if (pkg.sources.length === 0) {
    warnings.push('No knowledge sources provided; provenance will be empty.');
  }
  if (pkg.heroes.length === 0) {
    warnings.push('No heroes in import package.');
  }
  if (pkg.server_environment === 'advance') {
    const experimentalCount = pkg.heroes.reduce(
      (sum, hero) => sum + hero.abilities.filter((a) => a.experimental).length,
      0,
    );
    if (experimentalCount > 0) {
      warnings.push(
        `${experimentalCount} experimental abilit(ies) — Advance only; never activate on Original matches.`,
      );
    }
  }
  return warnings;
}

/**
 * Validate JSON text and compute diff against the latest published patch
 * (or named previous_patch_code) in the same server environment.
 * Does not write to the knowledge base.
 */
export async function previewGameKnowledgeImport(
  knowledge: GameKnowledgeRepository,
  userId: string,
  raw: string,
): Promise<GameKnowledgeImportPreview | GameKnowledgeImportPreviewFailure> {
  const parsedJson = parseGameKnowledgeImportJsonText(raw);
  if (!parsedJson.ok) {
    return { ok: false, errors: [parsedJson.message] };
  }
  const parsed = safeParseGameKnowledgeImportPackage(parsedJson.value);
  if (!parsed.success) {
    return { ok: false, errors: formatGameKnowledgeImportErrors(parsed) };
  }
  const pkg = parsed.data;

  let profile = await knowledge.getProfileBySlug(userId, pkg.game.slug);
  // Preview may run before profile exists — synthesize baseline against null.
  let baseline: GamePatchRecord | null = null;
  if (profile) {
    baseline = await findBaselinePatch(knowledge, userId, profile.id, pkg);
  }

  const baselineSnapshot = baseline
    ? await loadPatchSnapshot(knowledge, userId, baseline)
    : null;
  const diff = diffGameKnowledge(
    baselineSnapshot,
    snapshotFromImport(pkg),
    pkg.server_environment,
  );

  return {
    ok: true,
    package: pkg,
    diff,
    baseline_patch: baseline,
    warnings: collectWarnings(pkg, diff),
  };
}

/**
 * Import research JSON into a **draft** patch only.
 * Never publishes. Never activates on projects/videos.
 */
export async function importGameKnowledgeAsDraft(
  knowledge: GameKnowledgeRepository,
  userId: string,
  raw: string,
): Promise<
  | { ok: true; result: GameKnowledgeDraftImportResult }
  | { ok: false; errors: string[] }
> {
  const preview = await previewGameKnowledgeImport(knowledge, userId, raw);
  if (!preview.ok) return preview;
  const pkg = preview.package;

  let profile = await knowledge.getProfileBySlug(userId, pkg.game.slug);
  if (!profile) {
    profile = await knowledge.createProfile(userId, {
      slug: pkg.game.slug,
      name: pkg.game.name,
      description: pkg.game.description,
      terminology: pkg.game.terminology,
      gameplay_rules: pkg.game.gameplay_rules,
    });
  } else {
    profile = await knowledge.updateProfile(userId, profile.id, {
      name: pkg.game.name,
      description: pkg.game.description,
      terminology: pkg.game.terminology,
      gameplay_rules: pkg.game.gameplay_rules,
    });
  }

  if (pkg.server_profile) {
    await knowledge.upsertServerProfile(userId, profile.id, {
      environment: pkg.server_environment,
      terminology: pkg.server_profile.terminology,
      recognition_config: pkg.server_profile.recognition_config,
      notes: pkg.server_profile.notes,
    });
  } else {
    await knowledge.upsertServerProfile(userId, profile.id, {
      environment: pkg.server_environment,
      terminology: {},
      recognition_config: {},
      notes: '',
    });
  }

  const existingPatches = await knowledge.listPatches(
    userId,
    profile.id,
    pkg.server_environment,
  );
  const existingDraft = existingPatches.find(
    (p) => p.patch_code === pkg.patch.patch_code && p.status === 'draft',
  );
  const publishedSameCode = existingPatches.find(
    (p) => p.patch_code === pkg.patch.patch_code && p.status === 'published',
  );
  if (publishedSameCode) {
    return {
      ok: false,
      errors: [
        `Patch code "${pkg.patch.patch_code}" is already published for ${pkg.server_environment}. Create a new patch_code for updates.`,
      ],
    };
  }

  let previousPatchId: string | null = preview.baseline_patch?.id ?? null;
  if (pkg.patch.previous_patch_code) {
    const named = existingPatches.find((p) => p.patch_code === pkg.patch.previous_patch_code);
    previousPatchId = named?.id ?? previousPatchId;
  }

  let draft: GamePatchRecord;
  let created_new_draft = false;
  if (existingDraft) {
    draft = await knowledge.updateDraftPatch(userId, existingDraft.id, {
      title: pkg.patch.title,
      effective_from: pkg.patch.effective_from ?? null,
      effective_to: pkg.patch.effective_to ?? null,
      notes: pkg.patch.notes,
      previous_patch_id: previousPatchId,
    });
    await knowledge.clearDraftPatchContent(userId, draft.id);
  } else {
    draft = await knowledge.createPatch(userId, profile.id, {
      server_environment: pkg.server_environment,
      patch_code: pkg.patch.patch_code,
      title: pkg.patch.title,
      effective_from: pkg.patch.effective_from ?? null,
      effective_to: pkg.patch.effective_to ?? null,
      notes: pkg.patch.notes,
      previous_patch_id: previousPatchId,
    });
    created_new_draft = true;
  }

  for (const source of pkg.sources) {
    await knowledge.addKnowledgeSource(userId, draft.id, source);
  }

  for (const hero of pkg.heroes) {
    const savedHero: HeroKnowledgeRecord = await knowledge.upsertHero(userId, draft.id, {
      hero_key: hero.hero_key,
      name: hero.name,
      roles: hero.roles,
      lanes: hero.lanes,
      description: hero.description,
      passive: hero.passive,
      damage_types: hero.damage_types,
      cc_types: hero.cc_types,
      sound_signature_notes: hero.sound_signature_notes,
      revamp_notes: hero.revamp_notes,
    });
    for (const ability of hero.abilities) {
      await knowledge.upsertAbility(userId, savedHero.id, ability);
    }
  }

  return {
    ok: true,
    result: {
      profile,
      draft_patch: draft,
      diff: preview.diff,
      warnings: preview.warnings,
      created_new_draft,
    },
  };
}

/**
 * Human-gated publish. Requires exact confirmation phrase.
 * Import paths must never call this implicitly.
 */
export async function publishGameKnowledgeWithConfirmation(
  knowledge: GameKnowledgeRepository,
  userId: string,
  patchId: string,
  confirmationPhrase: string,
): Promise<GamePatchRecord> {
  if (confirmationPhrase !== PUBLISH_GAME_KNOWLEDGE_PHRASE) {
    throw new Error(
      `Publish rejected: type ${PUBLISH_GAME_KNOWLEDGE_PHRASE} to publish game knowledge`,
    );
  }
  return knowledge.publishPatch(userId, patchId);
}
