import { randomUUID } from 'node:crypto';
import {
  MATCH_COMMENTARY_SCHEMA_VERSION,
  claimTypeForEventType,
  type MatchCommentaryLine,
  type MatchCommentaryScript,
} from '@ai-shorts-factory/validation';
import type { MatchEventCandidate } from '@ai-shorts-factory/validation';
import type { ActivatedGameKnowledge } from './game-knowledge-types.js';
import type { MatchTimelineWithEvents } from './match-event-types.js';
import { validateMatchCommentary } from './match-commentary-validate.js';

function heroLabel(heroKey: string | null | undefined, knowledge: ActivatedGameKnowledge): string {
  if (!heroKey) return 'an unknown hero';
  return knowledge.heroes.find((hero) => hero.hero_key === heroKey)?.name ?? heroKey;
}

function participantName(
  participant: MatchEventCandidate['participants'][number],
  knowledge: ActivatedGameKnowledge,
): string {
  if (participant.player_tag) return participant.player_tag;
  return heroLabel(participant.hero_key, knowledge);
}

function buildLineForEvent(
  event: MatchEventCandidate,
  knowledge: ActivatedGameKnowledge,
): MatchCommentaryLine | null {
  if (!event.id || event.rejected) return null;
  const claimType = claimTypeForEventType(event.event_type);
  if (claimType === 'color') return null;

  const actor = event.participants.find((p) => p.role === 'actor');
  const target = event.participants.find((p) => p.role === 'target');
  const heroKeys = event.participants
    .map((p) => p.hero_key)
    .filter((key): key is string => Boolean(key));
  const playerTags = event.participants
    .map((p) => p.player_tag)
    .filter((tag): tag is string => Boolean(tag));

  let text = '';
  switch (event.event_type) {
    case 'kill':
      text = `${participantName(actor ?? { role: 'unknown' }, knowledge)} takes down ${participantName(target ?? { role: 'unknown' }, knowledge)}!`;
      break;
    case 'turtle':
      text = `Turtle secured at ${event.timestamp_seconds.toFixed(1)}s.`;
      break;
    case 'lord':
      text = `Lord is down — objective confirmed at ${event.timestamp_seconds.toFixed(1)}s.`;
      break;
    case 'turret':
      text = `Turret destroyed at ${event.timestamp_seconds.toFixed(1)}s.`;
      break;
    case 'teamfight':
      text = `Team fight erupting at ${event.timestamp_seconds.toFixed(1)}s.`;
      break;
    default:
      return null;
  }

  return {
    id: randomUUID(),
    event_id: event.id,
    claim_type: claimType,
    text,
    confirmed: true,
    timestamp_seconds: event.timestamp_seconds,
    hero_keys_mentioned: heroKeys,
    player_tags_mentioned: playerTags,
    ability_keys_mentioned: [],
  };
}

export type BuildMatchCommentaryInput = {
  matchSourceId: string;
  timeline: MatchTimelineWithEvents;
  knowledge: ActivatedGameKnowledge;
  language?: string;
  /** Optional non-confirmed opener; must not assert facts. */
  includeColorHook?: boolean;
};

export type BuildMatchCommentaryResult = {
  script: MatchCommentaryScript;
  validation: ReturnType<typeof validateMatchCommentary>;
};

/**
 * Build grounded commentary lines exclusively from non-rejected timeline events
 * and the activated patch knowledge snapshot.
 */
export function buildMatchCommentary(
  input: BuildMatchCommentaryInput,
): BuildMatchCommentaryResult {
  const lines: MatchCommentaryLine[] = [];

  if (input.includeColorHook) {
    lines.push({
      id: randomUUID(),
      event_id: null,
      claim_type: 'color',
      text: 'The pace is rising — stay locked on the next objective.',
      confirmed: false,
      timestamp_seconds: null,
      hero_keys_mentioned: [],
      player_tags_mentioned: [],
      ability_keys_mentioned: [],
    });
  }

  const events = [...input.timeline.events]
    .filter((event) => !event.rejected)
    .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);

  for (const event of events) {
    const line = buildLineForEvent(event, input.knowledge);
    if (line) lines.push(line);
  }

  const script: MatchCommentaryScript = {
    schema_version: MATCH_COMMENTARY_SCHEMA_VERSION,
    match_source_id: input.matchSourceId,
    timeline_id: input.timeline.id,
    server_environment: input.timeline.server_environment,
    game_patch_id: input.timeline.game_patch_id,
    language: input.language ?? 'en',
    lines,
    generated_at: new Date().toISOString(),
    notes: 'Generated from verified timeline events only. Predictions are never auto-confirmed.',
  };

  const validation = validateMatchCommentary({
    script,
    events: input.timeline.events,
    knowledge: input.knowledge,
  });

  return { script, validation };
}

/**
 * Attach a confirmed ability callout only when the ability exists in activated KB
 * and the line remains bound to an existing event.
 */
export function attachAbilityMention(input: {
  script: MatchCommentaryScript;
  lineId: string;
  abilityKey: string;
  knowledge: ActivatedGameKnowledge;
  events: MatchEventCandidate[];
}): BuildMatchCommentaryResult {
  const ability = input.knowledge.heroes
    .flatMap((hero) => hero.abilities.map((item) => ({ hero, ability: item })))
    .find((row) => row.ability.ability_key === input.abilityKey);

  if (!ability) {
    return {
      script: input.script,
      validation: {
        ok: false,
        errors: [
          {
            code: 'UNKNOWN_ABILITY',
            message: `Ability "${input.abilityKey}" is not in activated knowledge`,
          },
        ],
        warnings: [],
      },
    };
  }

  if (input.script.server_environment === 'original' && ability.ability.experimental) {
    return {
      script: input.script,
      validation: {
        ok: false,
        errors: [
          {
            code: 'EXPERIMENTAL_ABILITY_ON_ORIGINAL',
            message: `Cannot attach experimental ability "${input.abilityKey}" on Original Server`,
          },
        ],
        warnings: [],
      },
    };
  }

  const lines = input.script.lines.map((line) => {
    if (line.id !== input.lineId) return line;
    if (!line.event_id || !line.confirmed) return line;
    const abilityKeys = Array.from(new Set([...line.ability_keys_mentioned, input.abilityKey]));
    return {
      ...line,
      ability_keys_mentioned: abilityKeys,
      text: `${line.text} ${ability.ability.name} is in play.`,
    };
  });

  const script = { ...input.script, lines };
  return {
    script,
    validation: validateMatchCommentary({
      script,
      events: input.events,
      knowledge: input.knowledge,
    }),
  };
}
