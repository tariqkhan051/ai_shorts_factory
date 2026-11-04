import {
  buildFlowGenerationPackage,
  describeFlowProviderStatus,
  type FlowGenerationPackage,
  type FlowCharacterReferenceHint,
} from '@ai-shorts-factory/flow-adapter';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import type { CharacterRecord } from '@ai-shorts-factory/database';
import type { ScreenplayV1 } from '@ai-shorts-factory/validation';
import type { GenerationSceneRecord } from '@ai-shorts-factory/workflow-engine';

export function characterHintsFromScreenplay(
  screenplay: ScreenplayV1,
  storedCharacters: CharacterRecord[] = [],
): FlowCharacterReferenceHint[] {
  const byName = new Map(
    storedCharacters.map((character) => [character.name.toLowerCase(), character]),
  );

  return screenplay.characters.map((character) => {
    const stored = byName.get(character.name.toLowerCase());
    return {
      name: character.name,
      visualIdentity: character.visual_identity,
      clothing: character.clothing,
      appearanceDetails: character.appearance_details,
      flowLibraryHint:
        stored?.name ??
        `${character.name.toLowerCase().replace(/\s+/g, '-')}-reference`,
    };
  });
}

export function buildProjectFlowGenerationPackage(input: {
  projectId: string;
  projectName?: string;
  screenplay: ScreenplayV1;
  scenes: GenerationSceneRecord[];
  characters?: CharacterRecord[];
  env?: NodeJS.ProcessEnv;
}): FlowGenerationPackage {
  const flow = describeFlowProviderStatus(input.env ?? process.env);
  const refs = characterHintsFromScreenplay(input.screenplay, input.characters ?? []);

  return buildFlowGenerationPackage({
    projectId: input.projectId,
    projectName: input.projectName,
    model: flow.model,
    aspectRatio: flow.aspectRatio,
    resolution: flow.resolution,
    durationSeconds: flow.durationSeconds,
    estimatedCostPerScene: flow.estimatedCostPerScene,
    characterReferences: refs,
    scenes: input.scenes.map((scene) => ({
      sceneId: scene.id,
      sceneNumber: scene.sceneNumber,
      title: scene.title,
      flowPrompt: scene.flowPrompt,
      durationSeconds: scene.durationSeconds || BUSINESS_DEFAULTS.defaultGenerationDurationSeconds,
      completionStatus: scene.state,
      confirmedCreditCost: scene.confirmedCreditCost,
    })),
  });
}

export function projectCreditSummary(scenes: GenerationSceneRecord[], estimatedPerScene: number | 'unknown') {
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
    confirmedProjectCost: confirmedKnown && scenes.some((s) => typeof s.confirmedCreditCost === 'number')
      ? confirmedTotal
      : scenes.every((s) => s.confirmedCreditCost === undefined)
        ? undefined
        : ('unknown' as const),
    unknownCreditScenes: unknownCount,
  };
}
