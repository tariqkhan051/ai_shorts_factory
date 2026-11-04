import {
  assertRecipeShape,
  createUnverifiedFlowUiRecipe,
  type FlowUiRecipe,
} from './flow-ui-recipe.js';

/** Env/JSON recipe loader — safe for web bundles (no node:fs). */
export function loadFlowUiRecipeFromEnv(env: NodeJS.ProcessEnv): FlowUiRecipe {
  if (env.FLOW_UI_RECIPE_JSON?.trim()) {
    return assertRecipeShape(JSON.parse(env.FLOW_UI_RECIPE_JSON) as unknown);
  }
  return createUnverifiedFlowUiRecipe({
    baseUrl: env.FLOW_BASE_URL ?? '',
  });
}
