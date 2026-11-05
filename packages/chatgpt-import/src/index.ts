/**
 * Package: @ai-shorts-factory/chatgpt-import
 * ChatGPT prompt generation and JSON screenplay import (no paid API).
 */

export const PACKAGE_NAME = '@ai-shorts-factory/chatgpt-import' as const;
export const PACKAGE_PHASE = 2 as const;
export const PACKAGE_STATUS = 'active' as const;

export {
  buildChatGptProductionPrompt,
  type PromptProjectContext,
  type PromptLibraryCharacter,
  type PromptLibraryEnvironment,
} from './prompt.js';
export { normalizeImportedScreenplay, parseImportedJsonText } from './normalize.js';
export { importScreenplayFromText, type ScreenplayImportResult } from './import-screenplay.js';
export { createSampleScreenplay } from './sample-screenplay.js';
export { buildMatchCommentaryPolishPrompt } from './commentary-prompt.js';

export function getPackageMeta() {
  return {
    name: PACKAGE_NAME,
    phase: PACKAGE_PHASE,
    status: PACKAGE_STATUS,
    description: 'ChatGPT prompt generation and JSON screenplay/commentary import',
  } as const;
}
