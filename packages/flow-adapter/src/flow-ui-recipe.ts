/**
 * Operator-verified UI recipe for Google Flow browser automation.
 * Selectors must be filled after inspecting the live Flow UI — never invent APIs.
 */

export type FlowUiSelectors = {
  /** Prompt / description textarea or contenteditable */
  promptInput: string;
  /** Control used to pick the generation model */
  modelControl: string;
  /** Control used to pick clip duration */
  durationControl: string;
  /** Control used to pick resolution */
  resolutionControl: string;
  /** Optional control used to pick aspect ratio (e.g. 9:16) */
  aspectRatioControl?: string;
  /** Primary generate / submit control */
  submitButton: string;
  /** Element present when the result asset is ready */
  resultReady: string;
  /** Control that starts download of the result */
  downloadButton: string;
  /** Optional badge/label showing observed credit cost */
  creditCostBadge?: string;
  /** Visible when CAPTCHA / extra verification blocks automation */
  captchaOrChallenge?: string;
  /** Visible when the session needs interactive Google sign-in */
  loginRequired?: string;
  /** Visible when the authenticated Flow workspace is ready */
  workspaceReady?: string;
  /** Opens Ingredients / reference-image picker for character consistency */
  addIngredientsButton?: string;
};

export type FlowUiRecipe = {
  version: 1;
  /** ISO timestamp set only after a human verified selectors against live Flow UI */
  verifiedAt: string | null;
  verifiedBy: string | null;
  notes?: string;
  baseUrl: string;
  selectors: FlowUiSelectors;
  /** Optional model option label/value to select in the UI */
  modelOptionLabel?: string;
  /** Optional aspect ratio option label (intended: 9:16) */
  aspectRatioOptionLabel?: string;
};

export const REQUIRED_SELECTOR_KEYS = [
  'promptInput',
  'modelControl',
  'durationControl',
  'resolutionControl',
  'submitButton',
  'resultReady',
  'downloadButton',
] as const satisfies ReadonlyArray<keyof FlowUiSelectors>;

export function createUnverifiedFlowUiRecipe(
  overrides?: Partial<Omit<FlowUiRecipe, 'selectors' | 'version'>> & {
    selectors?: Partial<FlowUiSelectors>;
    aspectRatioOptionLabel?: string;
  },
): FlowUiRecipe {
  return {
    version: 1,
    verifiedAt: overrides?.verifiedAt ?? null,
    verifiedBy: overrides?.verifiedBy ?? null,
    notes:
      overrides?.notes ??
      'Fill selectors after inspecting live Google Flow. Do not invent HTTP APIs or bypass CAPTCHA.',
    baseUrl: overrides?.baseUrl ?? '',
    modelOptionLabel: overrides?.modelOptionLabel,
    aspectRatioOptionLabel: overrides?.aspectRatioOptionLabel,
    selectors: {
      promptInput: '',
      modelControl: '',
      durationControl: '',
      resolutionControl: '',
      aspectRatioControl: '',
      submitButton: '',
      resultReady: '',
      downloadButton: '',
      captchaOrChallenge: '',
      loginRequired: '',
      workspaceReady: '',
      ...overrides?.selectors,
    },
  };
}

export function assertRecipeShape(value: unknown): FlowUiRecipe {
  if (!value || typeof value !== 'object') {
    throw new Error('Flow UI recipe must be an object');
  }
  const recipe = value as FlowUiRecipe;
  if (recipe.version !== 1) {
    throw new Error(`Unsupported Flow UI recipe version: ${String(recipe.version)}`);
  }
  if (typeof recipe.baseUrl !== 'string') {
    throw new Error('Flow UI recipe.baseUrl must be a string');
  }
  if (!recipe.selectors || typeof recipe.selectors !== 'object') {
    throw new Error('Flow UI recipe.selectors is required');
  }
  return recipe;
}

export function listMissingSelectors(recipe: FlowUiRecipe): string[] {
  return REQUIRED_SELECTOR_KEYS.filter((key) => {
    const value = recipe.selectors[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });
}

export function isRecipeVerified(recipe: FlowUiRecipe): boolean {
  if (!recipe.verifiedAt) {
    return false;
  }
  const verifiedTime = Date.parse(recipe.verifiedAt);
  if (Number.isNaN(verifiedTime)) {
    return false;
  }
  return listMissingSelectors(recipe).length === 0 && recipe.baseUrl.trim().length > 0;
}
