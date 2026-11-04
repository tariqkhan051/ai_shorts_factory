import {
  formatScreenplayErrors,
  safeParseScreenplayV1,
  type ScreenplayV1,
} from '@ai-shorts-factory/validation';
import { normalizeImportedScreenplay, parseImportedJsonText } from './normalize.js';

export type ScreenplayImportResult =
  | {
      ok: true;
      screenplay: ScreenplayV1;
      warnings: string[];
    }
  | {
      ok: false;
      errors: string[];
    };

/**
 * Validate and normalize a ChatGPT JSON paste.
 * On failure, callers must leave previously saved story versions untouched.
 */
export function importScreenplayFromText(raw: string): ScreenplayImportResult {
  const parsed = parseImportedJsonText(raw);
  if (!parsed.ok) {
    return { ok: false, errors: [parsed.message] };
  }

  const normalized = normalizeImportedScreenplay(parsed.value);
  const result = safeParseScreenplayV1(normalized);
  if (!result.success) {
    return { ok: false, errors: formatScreenplayErrors(result) };
  }

  const warnings: string[] = [];
  const total = result.data.scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0);
  if (total < 20) {
    warnings.push(`Total duration is only ${total}s; target is usually 30–40s.`);
  }

  return { ok: true, screenplay: result.data, warnings };
}
