import { readFile } from 'node:fs/promises';
import { assertRecipeShape, type FlowUiRecipe } from './flow-ui-recipe.js';

export { loadFlowUiRecipeFromEnv } from './load-recipe-env.js';

/** File recipe loader — Node-only; do not import from client components. */
export async function loadFlowUiRecipeFromFile(path: string): Promise<FlowUiRecipe> {
  const raw = await readFile(path, 'utf8');
  return assertRecipeShape(JSON.parse(raw) as unknown);
}
