import type { GameServerEnvironment } from '@ai-shorts-factory/shared-types';
import {
  FACTUAL_CLAIM_TYPES,
  type MatchCommentaryLine,
  type MatchCommentaryScript,
} from '@ai-shorts-factory/validation';
import type { MatchEventCandidate } from '@ai-shorts-factory/validation';
import type { ActivatedGameKnowledge } from './game-knowledge-types.js';

export type CommentaryValidationIssue = {
  code: string;
  line_id?: string;
  message: string;
};

export type CommentaryValidationResult =
  | { ok: true; warnings: CommentaryValidationIssue[] }
  | { ok: false; errors: CommentaryValidationIssue[]; warnings: CommentaryValidationIssue[] };

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

function indexEvents(events: MatchEventCandidate[]): Map<string, MatchEventCandidate> {
  const map = new Map<string, MatchEventCandidate>();
  for (const event of events) {
    if (event.id) map.set(event.id, event);
  }
  return map;
}

function buildAbilityIndex(knowledge: ActivatedGameKnowledge): Map<string, { experimental: boolean; hero_key: string }> {
  const map = new Map<string, { experimental: boolean; hero_key: string }>();
  for (const hero of knowledge.heroes) {
    for (const ability of hero.abilities) {
      map.set(ability.ability_key, {
        experimental: ability.experimental,
        hero_key: hero.hero_key,
      });
    }
  }
  return map;
}

function buildHeroKeySet(knowledge: ActivatedGameKnowledge): Set<string> {
  return new Set(knowledge.heroes.map((hero) => hero.hero_key));
}

function eventAllowsHero(event: MatchEventCandidate, heroKey: string): boolean {
  return event.participants.some((p) => p.hero_key === heroKey);
}

function eventAllowsPlayer(event: MatchEventCandidate, playerTag: string): boolean {
  const needle = normalizeTag(playerTag);
  return event.participants.some(
    (p) => p.player_tag != null && normalizeTag(p.player_tag) === needle,
  );
}

/**
 * Validate commentary claims against the timeline + activated patch knowledge.
 * Rejects unevidenced kills/objectives/abilities and Advance experimental leaks on Original.
 */
export function validateMatchCommentary(input: {
  script: MatchCommentaryScript;
  events: MatchEventCandidate[];
  knowledge: ActivatedGameKnowledge;
}): CommentaryValidationResult {
  const errors: CommentaryValidationIssue[] = [];
  const warnings: CommentaryValidationIssue[] = [];
  const eventMap = indexEvents(input.events.filter((event) => !event.rejected));
  const abilityIndex = buildAbilityIndex(input.knowledge);
  const heroKeys = buildHeroKeySet(input.knowledge);
  const environment: GameServerEnvironment = input.script.server_environment;

  if (input.script.game_patch_id !== input.knowledge.patch.id) {
    errors.push({
      code: 'PATCH_MISMATCH',
      message: 'Commentary game_patch_id does not match activated knowledge patch',
    });
  }
  if (environment !== input.knowledge.server_environment) {
    errors.push({
      code: 'ENVIRONMENT_MISMATCH',
      message: 'Commentary server_environment does not match activated knowledge environment',
    });
  }
  if (input.knowledge.patch.server_environment !== environment) {
    errors.push({
      code: 'ENVIRONMENT_MISMATCH',
      message: 'Activated patch environment does not match commentary environment',
    });
  }

  for (const line of input.script.lines) {
    validateLine(line, {
      eventMap,
      abilityIndex,
      heroKeys,
      environment,
      errors,
      warnings,
    });
  }

  return errors.length > 0 ? { ok: false, errors, warnings } : { ok: true, warnings };
}

function validateLine(
  line: MatchCommentaryLine,
  ctx: {
    eventMap: Map<string, MatchEventCandidate>;
    abilityIndex: Map<string, { experimental: boolean; hero_key: string }>;
    heroKeys: Set<string>;
    environment: GameServerEnvironment;
    errors: CommentaryValidationIssue[];
    warnings: CommentaryValidationIssue[];
  },
): void {
  const factual = FACTUAL_CLAIM_TYPES.has(line.claim_type);

  if (factual && line.confirmed !== true) {
    ctx.errors.push({
      code: 'FACTUAL_NOT_CONFIRMED',
      line_id: line.id,
      message: `Factual claim_type "${line.claim_type}" must set confirmed=true`,
    });
  }
  if ((line.claim_type === 'prediction' || line.claim_type === 'color') && line.confirmed) {
    ctx.errors.push({
      code: 'UNCONFIRMED_MARKED_CONFIRMED',
      line_id: line.id,
      message: `${line.claim_type} lines must set confirmed=false`,
    });
  }

  if (factual) {
    if (!line.event_id) {
      ctx.errors.push({
        code: 'MISSING_EVENT_ID',
        line_id: line.id,
        message: `Factual claim "${line.claim_type}" requires event_id evidence`,
      });
      return;
    }
    const event = ctx.eventMap.get(line.event_id);
    if (!event) {
      ctx.errors.push({
        code: 'UNKNOWN_OR_REJECTED_EVENT',
        line_id: line.id,
        message: `event_id ${line.event_id} is missing or rejected`,
      });
      return;
    }
    if (line.claim_type !== 'ability' && line.claim_type !== event.event_type) {
      ctx.errors.push({
        code: 'EVENT_TYPE_MISMATCH',
        line_id: line.id,
        message: `claim_type "${line.claim_type}" does not match event_type "${event.event_type}"`,
      });
    }
    for (const heroKey of line.hero_keys_mentioned) {
      if (!eventAllowsHero(event, heroKey)) {
        ctx.errors.push({
          code: 'UNEVIDENCED_HERO',
          line_id: line.id,
          message: `Hero "${heroKey}" is not a participant on event ${event.id}`,
        });
      }
    }
    for (const tag of line.player_tags_mentioned) {
      if (!eventAllowsPlayer(event, tag)) {
        ctx.errors.push({
          code: 'UNEVIDENCED_PLAYER',
          line_id: line.id,
          message: `Player "${tag}" is not evidenced on event ${event.id}`,
        });
      }
    }
  } else if (line.event_id) {
    const event = ctx.eventMap.get(line.event_id);
    if (!event) {
      ctx.errors.push({
        code: 'UNKNOWN_OR_REJECTED_EVENT',
        line_id: line.id,
        message: `event_id ${line.event_id} is missing or rejected`,
      });
    }
  }

  for (const heroKey of line.hero_keys_mentioned) {
    if (!ctx.heroKeys.has(heroKey)) {
      ctx.errors.push({
        code: 'UNKNOWN_HERO_IN_PATCH',
        line_id: line.id,
        message: `Hero "${heroKey}" is not in the activated patch knowledge`,
      });
    }
  }

  for (const abilityKey of line.ability_keys_mentioned) {
    const ability = ctx.abilityIndex.get(abilityKey);
    if (!ability) {
      ctx.errors.push({
        code: 'UNKNOWN_ABILITY',
        line_id: line.id,
        message: `Ability "${abilityKey}" is not in the activated patch knowledge`,
      });
      continue;
    }
    if (ctx.environment === 'original' && ability.experimental) {
      ctx.errors.push({
        code: 'EXPERIMENTAL_ABILITY_ON_ORIGINAL',
        line_id: line.id,
        message: `Experimental ability "${abilityKey}" cannot be used for Original Server commentary`,
      });
    }
    if (line.claim_type === 'ability' && line.confirmed && !line.event_id) {
      ctx.errors.push({
        code: 'ABILITY_WITHOUT_EVENT',
        line_id: line.id,
        message: `Confirmed ability claim requires event_id context`,
      });
    }
  }

  if (line.claim_type === 'prediction') {
    ctx.warnings.push({
      code: 'PREDICTION_LINE',
      line_id: line.id,
      message: 'Prediction lines must not be presented as confirmed outcomes',
    });
  }
}

/**
 * Ensure a polished package does not invent new factual claims vs the grounded base script.
 */
export function validateCommentaryPolishAgainstBase(input: {
  base: MatchCommentaryScript;
  polishedLines: MatchCommentaryLine[];
  events: MatchEventCandidate[];
  knowledge: ActivatedGameKnowledge;
}): CommentaryValidationResult {
  const baseById = new Map(input.base.lines.map((line) => [line.id, line]));
  const errors: CommentaryValidationIssue[] = [];
  const warnings: CommentaryValidationIssue[] = [];

  for (const line of input.polishedLines) {
    const base = baseById.get(line.id);
    if (!base) {
      // New line: must still pass evidence rules and cannot be a new confirmed factual claim
      // without being present in base — treat as error to prevent invention.
      if (FACTUAL_CLAIM_TYPES.has(line.claim_type) && line.confirmed) {
        errors.push({
          code: 'POLISH_INVENTED_FACT',
          line_id: line.id,
          message: 'Polish introduced a new confirmed factual line not present in the base script',
        });
      }
      continue;
    }
    if (base.event_id !== line.event_id) {
      errors.push({
        code: 'POLISH_EVENT_ID_CHANGED',
        line_id: line.id,
        message: 'Polish must not change event_id bindings',
      });
    }
    if (base.claim_type !== line.claim_type) {
      errors.push({
        code: 'POLISH_CLAIM_TYPE_CHANGED',
        line_id: line.id,
        message: 'Polish must not change claim_type',
      });
    }
    if (base.confirmed !== line.confirmed) {
      errors.push({
        code: 'POLISH_CONFIRMED_CHANGED',
        line_id: line.id,
        message: 'Polish must not change confirmed flag',
      });
    }
    for (const heroKey of line.hero_keys_mentioned) {
      if (!base.hero_keys_mentioned.includes(heroKey)) {
        errors.push({
          code: 'POLISH_ADDED_HERO',
          line_id: line.id,
          message: `Polish added hero "${heroKey}" not present in base line`,
        });
      }
    }
    for (const tag of line.player_tags_mentioned) {
      if (!base.player_tags_mentioned.includes(tag)) {
        errors.push({
          code: 'POLISH_ADDED_PLAYER',
          line_id: line.id,
          message: `Polish added player "${tag}" not present in base line`,
        });
      }
    }
    for (const abilityKey of line.ability_keys_mentioned) {
      if (!base.ability_keys_mentioned.includes(abilityKey)) {
        errors.push({
          code: 'POLISH_ADDED_ABILITY',
          line_id: line.id,
          message: `Polish added ability "${abilityKey}" not present in base line`,
        });
      }
    }
  }

  const draft: MatchCommentaryScript = {
    ...input.base,
    lines: input.polishedLines,
  };
  const evidenceCheck = validateMatchCommentary({
    script: draft,
    events: input.events,
    knowledge: input.knowledge,
  });
  if (!evidenceCheck.ok) {
    errors.push(...evidenceCheck.errors);
  }
  warnings.push(...evidenceCheck.warnings);

  return errors.length > 0 ? { ok: false, errors, warnings } : { ok: true, warnings };
}
