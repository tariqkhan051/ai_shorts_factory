import {
  buildFlowGenerationPackage,
  describeFlowProviderStatus,
  type FlowGenerationPackage,
  type FlowCharacterReferenceHint,
} from '@ai-shorts-factory/flow-adapter';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import type { CharacterRecord, ReferenceAssetRecord } from '@ai-shorts-factory/database';
import { scenesForCharacter } from '@ai-shorts-factory/database';
import { formatVisualIdentity, type ScreenplayV1, type SceneV1 } from '@ai-shorts-factory/validation';
import type { GenerationSceneRecord } from '@ai-shorts-factory/workflow-engine';

export type CharacterReferenceContext = {
  character: CharacterRecord;
  primary?: ReferenceAssetRecord | null;
  additional: ReferenceAssetRecord[];
  previewUrl?: string;
  additionalPreviewUrls: string[];
};

export function characterHintsFromScreenplay(
  screenplay: ScreenplayV1,
  storedCharacters: CharacterRecord[] = [],
  referenceContext: Map<string, CharacterReferenceContext> = new Map(),
): FlowCharacterReferenceHint[] {
  const byName = new Map(
    storedCharacters.map((character) => [character.name.toLowerCase(), character]),
  );
  const byScreenplayId = new Map(
    storedCharacters
      .filter((character) => character.screenplay_character_id)
      .map((character) => [character.screenplay_character_id!, character]),
  );

  return screenplay.characters.map((character) => {
    const stored =
      (character.character_id ? byScreenplayId.get(character.character_id) : undefined) ??
      byName.get(character.name.toLowerCase());
    const visualIdentity = formatVisualIdentity(character.visual_identity);
    const structured =
      typeof character.visual_identity === 'string' ? null : character.visual_identity;
    const ctx = stored ? referenceContext.get(stored.id) : undefined;
    const referenceReady = Boolean(stored?.primary_reference_asset_id || ctx?.primary);
    return {
      characterId: character.character_id ?? stored?.screenplay_character_id ?? undefined,
      name: character.name,
      visualIdentity: stored?.visual_identity || visualIdentity,
      clothing: stored?.clothing || character.clothing || structured?.clothing,
      appearanceDetails:
        stored?.appearance_details ||
        character.appearance_details ||
        structured?.distinctive_features,
      continuityRules: stored?.continuity_rules || character.continuity_rules,
      referenceReady,
      missingReference: !referenceReady,
      primaryReferenceAssetId:
        stored?.primary_reference_asset_id ?? ctx?.primary?.id ?? undefined,
      additionalReferenceAssetIds: ctx?.additional.map((asset) => asset.id),
      previewUrl: ctx?.previewUrl,
      additionalPreviewUrls: ctx?.additionalPreviewUrls,
      flowLibraryHint:
        stored?.name ??
        `${character.name.toLowerCase().replace(/\s+/g, '-')}-reference`,
    };
  });
}

export function buildContinuityBlock(refs: FlowCharacterReferenceHint[]): string {
  if (refs.length === 0) return '';
  return refs
    .map((ref) => {
      const lines = [
        `Character: ${ref.name}`,
        ref.visualIdentity ? `Visual identity: ${ref.visualIdentity}` : '',
        ref.clothing ? `Clothing: ${ref.clothing}` : '',
        ref.appearanceDetails ? `Appearance: ${ref.appearanceDetails}` : '',
        ref.continuityRules ? `Continuity: ${ref.continuityRules}` : '',
        ref.referenceReady
          ? `Reference image: use primary Ingredients asset (${ref.flowLibraryHint ?? ref.name})`
          : 'Reference image: MISSING — upload a primary reference before relying on visual continuity',
      ].filter(Boolean);
      return lines.join('\n');
    })
    .join('\n\n');
}

export function buildCombinedScenePrompt(flowPrompt: string, continuity: string): string {
  if (!continuity.trim()) return flowPrompt;
  return `${flowPrompt.trim()}\n\n--- Character continuity (operator Ingredients) ---\n${continuity.trim()}`;
}

function refsForScene(
  scene: SceneV1,
  allHints: FlowCharacterReferenceHint[],
  screenplay: ScreenplayV1,
  storedCharacters: CharacterRecord[],
): FlowCharacterReferenceHint[] {
  if ((scene.character_ids?.length ?? 0) > 0) {
    const wanted = new Set(scene.character_ids ?? []);
    const matched = allHints.filter(
      (hint) => hint.characterId && wanted.has(hint.characterId),
    );
    if (matched.length > 0) return matched;
  }

  const appearing = storedCharacters.filter((character) =>
    scenesForCharacter(
      screenplay,
      character.screenplay_character_id,
      character.name,
    ).includes(scene.scene_number),
  );
  if (appearing.length > 0) {
    const names = new Set(appearing.map((c) => c.name.toLowerCase()));
    return allHints.filter((hint) => names.has(hint.name.toLowerCase()));
  }
  return allHints;
}

export function buildProjectFlowGenerationPackage(input: {
  projectId: string;
  projectName?: string;
  screenplay: ScreenplayV1;
  scenes: GenerationSceneRecord[];
  characters?: CharacterRecord[];
  referenceContext?: Map<string, CharacterReferenceContext>;
  env?: NodeJS.ProcessEnv;
}): FlowGenerationPackage {
  const flow = describeFlowProviderStatus(input.env ?? process.env);
  const characters = input.characters ?? [];
  const allHints = characterHintsFromScreenplay(
    input.screenplay,
    characters,
    input.referenceContext ?? new Map(),
  );

  const sceneByNumber = new Map(input.screenplay.scenes.map((scene) => [scene.scene_number, scene]));

  return buildFlowGenerationPackage({
    projectId: input.projectId,
    projectName: input.projectName,
    model: flow.model,
    aspectRatio: flow.aspectRatio,
    resolution: flow.resolution,
    durationSeconds: flow.durationSeconds,
    estimatedCostPerScene: flow.estimatedCostPerScene,
    characterReferences: allHints,
    scenes: input.scenes.map((scene) => {
      const screenplayScene = sceneByNumber.get(scene.sceneNumber);
      const sceneRefs = screenplayScene
        ? refsForScene(screenplayScene, allHints, input.screenplay, characters)
        : allHints;
      const continuityPrompt = buildContinuityBlock(sceneRefs);
      const combinedPrompt = buildCombinedScenePrompt(scene.flowPrompt, continuityPrompt);
      const meta = scene.assetMetadata as { verificationError?: string } | undefined;
      return {
        sceneId: scene.id,
        sceneNumber: scene.sceneNumber,
        title: scene.title,
        flowPrompt: scene.flowPrompt,
        continuityPrompt,
        combinedPrompt,
        durationSeconds: scene.durationSeconds || BUSINESS_DEFAULTS.defaultGenerationDurationSeconds,
        completionStatus: scene.state,
        confirmedCreditCost: scene.confirmedCreditCost,
        characterReferences: sceneRefs,
        verificationFailureReason:
          scene.state === 'VERIFICATION_FAILED'
            ? meta?.verificationError || scene.errorMessage || 'Verification failed'
            : undefined,
      };
    }),
  });
}

export function projectCreditSummary(
  scenes: GenerationSceneRecord[],
  estimatedPerScene: number | 'unknown',
) {
  const estimated =
    typeof estimatedPerScene === 'number'
      ? estimatedPerScene * scenes.length
      : ('unknown' as const);
  let confirmedTotal = 0;
  let confirmedKnown = true;
  let unknownCount = 0;
  for (const scene of scenes) {
    if (scene.confirmedCreditCost === 'unknown') {
      unknownCount += 1;
      confirmedKnown = false;
    } else if (typeof scene.confirmedCreditCost === 'number') {
      confirmedTotal += scene.confirmedCreditCost;
    }
  }
  return {
    estimatedProjectCost: estimated,
    confirmedProjectCost:
      confirmedKnown && scenes.some((s) => typeof s.confirmedCreditCost === 'number')
        ? confirmedTotal
        : scenes.every((s) => s.confirmedCreditCost === undefined)
          ? undefined
          : ('unknown' as const),
    unknownCreditScenes: unknownCount,
  };
}

export function charactersMissingReferences(characters: CharacterRecord[]): CharacterRecord[] {
  return characters.filter((character) => !character.primary_reference_asset_id);
}
