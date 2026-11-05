import type { MatchCommentaryScript } from '@ai-shorts-factory/validation';
import { MATCH_COMMENTARY_SCHEMA_VERSION } from '@ai-shorts-factory/validation';

/**
 * Build a copy/paste ChatGPT prompt to polish commentary wording ONLY.
 * Does not call any paid API. Operator must paste JSON back for validation.
 */
export function buildMatchCommentaryPolishPrompt(script: MatchCommentaryScript): string {
  const linesBlock = script.lines
    .map(
      (line, index) =>
        `${index + 1}. id=${line.id}
   event_id=${line.event_id ?? 'null'}
   claim_type=${line.claim_type}
   confirmed=${line.confirmed}
   timestamp_seconds=${line.timestamp_seconds ?? 'null'}
   hero_keys_mentioned=${JSON.stringify(line.hero_keys_mentioned)}
   player_tags_mentioned=${JSON.stringify(line.player_tags_mentioned)}
   ability_keys_mentioned=${JSON.stringify(line.ability_keys_mentioned)}
   text=${JSON.stringify(line.text)}`,
    )
    .join('\n');

  return `You are a sports commentary editor for Mobile Legends: Bang Bang highlight videos.

Rewrite ONLY the wording of the commentary lines below to sound exciting and natural.
You are polishing style — you are NOT analyzing a match and you MUST NOT invent facts.

HARD RULES
- Keep every line id exactly the same
- Keep event_id, claim_type, confirmed, timestamp_seconds exactly the same
- Keep hero_keys_mentioned, player_tags_mentioned, ability_keys_mentioned exactly the same arrays
- Do NOT add new lines
- Do NOT remove lines
- Do NOT invent player names, kills, assists, abilities, Turtle/Lord/turret outcomes
- Do NOT present predictions as confirmed facts
- Do NOT use Advance Server / experimental abilities as live facts
- Environment for this script: ${script.server_environment}
- Patch id: ${script.game_patch_id}

BASE LINES
${linesBlock}

OUTPUT FORMAT
Return ONLY valid JSON. No markdown fences. No explanation.
schema_version must be "${MATCH_COMMENTARY_SCHEMA_VERSION}".

JSON SHAPE
{
  "schema_version": "${MATCH_COMMENTARY_SCHEMA_VERSION}",
  "timeline_id": "${script.timeline_id}",
  "lines": [
    {
      "id": "uuid",
      "event_id": "uuid-or-null",
      "claim_type": "kill|turtle|lord|turret|teamfight|ability|color|prediction",
      "text": "polished wording only",
      "confirmed": true,
      "timestamp_seconds": 0,
      "hero_keys_mentioned": [],
      "player_tags_mentioned": [],
      "ability_keys_mentioned": []
    }
  ]
}`;
}
