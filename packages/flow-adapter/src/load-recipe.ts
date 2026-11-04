import { readFile } from 'node:fs/promises';
import {
  assertRecipeShape,
  createUnverifiedFlowUiRecipe,
  type FlowUiRecipe,
} from './flow-ui-recipe.js';

export async function loadFlowUiRecipeFromFile(path: string): Promise<FlowUiRecipe> {
  const raw = await readFile(path, 'utf8');
  return assertRecipeShape(JSON.parse(raw) as unknown);
}

export function loadFlowUiRecipeFromEnv(env: NodeJS.ProcessEnv): FlowUiRecipe {
  if (env.FLOW_UI_RECIPE_JSON?.trim()) {
    return assertRecipeShape(JSON.parse(env.FLOW_UI_RECIPE_JSON) as unknown);
  }
  return createUnverifiedFlowUiRecipe({
    baseUrl: env.FLOW_BASE_URL ?? '',
  });
}
