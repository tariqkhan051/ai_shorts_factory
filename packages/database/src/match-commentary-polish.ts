import {
  MATCH_COMMENTARY_SCHEMA_VERSION,
  parseMatchCommentaryPolishPackage,
  safeParseMatchCommentaryPolishPackage,
  type MatchCommentaryLine,
  type MatchCommentaryScript,
} from '@ai-shorts-factory/validation';
import type { MatchEventCandidate } from '@ai-shorts-factory/validation';
import type { ActivatedGameKnowledge } from './game-knowledge-types.js';
import {
  validateCommentaryPolishAgainstBase,
  type CommentaryValidationResult,
} from './match-commentary-validate.js';

function parseJsonText(raw: string): { ok: true; value: unknown } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: 'Polish JSON is empty' };
  let candidate = trimmed;
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  if (fence?.[1]) candidate = fence[1].trim();
  try {
    return { ok: true, value: JSON.parse(candidate) as unknown };
  } catch (error) {
    return {
      ok: false,
      message: `Invalid JSON: ${error instanceof Error ? error.message : 'parse error'}`,
    };
  }
}

export type ApplyCommentaryPolishResult =
  | {
      ok: true;
      script: MatchCommentaryScript;
      validation: CommentaryValidationResult;
    }
  | {
      ok: false;
      errors: string[];
      validation?: CommentaryValidationResult;
    };

/**
 * Apply ChatGPT-polished wording onto a grounded base script.
 * Evidence bindings and factual claims must remain unchanged.
 */
export function applyMatchCommentaryPolish(input: {
  base: MatchCommentaryScript;
  polishedJson: string;
  events: MatchEventCandidate[];
  knowledge: ActivatedGameKnowledge;
}): ApplyCommentaryPolishResult {
  const parsedJson = parseJsonText(input.polishedJson);
  if (!parsedJson.ok) return { ok: false, errors: [parsedJson.message] };

  const parsed = safeParseMatchCommentaryPolishPackage(parsedJson.value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const path = issue.path.length ? issue.path.join('.') : 'root';
        return `${path}: ${issue.message}`;
      }),
    };
  }

  if (parsed.data.timeline_id !== input.base.timeline_id) {
    return { ok: false, errors: ['Polish timeline_id does not match base commentary'] };
  }

  const polishedLines: MatchCommentaryLine[] = parsed.data.lines.map((line) => ({
    ...line,
    hero_keys_mentioned: line.hero_keys_mentioned ?? [],
    player_tags_mentioned: line.player_tags_mentioned ?? [],
    ability_keys_mentioned: line.ability_keys_mentioned ?? [],
  }));

  const validation = validateCommentaryPolishAgainstBase({
    base: input.base,
    polishedLines,
    events: input.events,
    knowledge: input.knowledge,
  });

  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors.map((issue) => `${issue.code}: ${issue.message}`),
      validation,
    };
  }

  const script: MatchCommentaryScript = {
    ...input.base,
    schema_version: MATCH_COMMENTARY_SCHEMA_VERSION,
    lines: polishedLines,
    generated_at: new Date().toISOString(),
    notes: `${input.base.notes}\nPolished wording applied; evidence bindings unchanged.`.trim(),
  };

  // Re-parse through full schema for safety.
  parseMatchCommentaryPolishPackage({
    schema_version: MATCH_COMMENTARY_SCHEMA_VERSION,
    timeline_id: script.timeline_id,
    lines: script.lines,
  });

  return { ok: true, script, validation };
}
