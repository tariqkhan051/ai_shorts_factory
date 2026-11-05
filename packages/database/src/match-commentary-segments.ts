import { randomUUID } from 'node:crypto';
import type { MatchCommentaryStyle } from '@ai-shorts-factory/shared-types';
import {
  MATCH_COMMENTARY_SEGMENT_SCHEMA_VERSION,
  type MatchCommentaryScript,
} from '@ai-shorts-factory/validation';

/**
 * Lift v1 grounded lines into Match Studio v2 timed segments for voice/EDL sync.
 */
export function commentaryScriptToSegments(
  script: MatchCommentaryScript,
  style: MatchCommentaryStyle = script.style ?? 'esports_caster',
) {
  const segments = script.lines.map((line, index) => {
    const start = line.timestamp_seconds ?? index * 4;
    const end = start + Math.max(2, Math.min(12, line.text.length / 14));
    return {
      id: line.id || randomUUID(),
      event_ids: line.event_id ? [line.event_id] : [],
      text: line.text,
      start_seconds: start,
      end_seconds: end,
      grounding_status: line.confirmed
        ? ('confirmed' as const)
        : line.claim_type === 'prediction' || line.claim_type === 'color'
          ? ('cautious' as const)
          : ('omitted' as const),
      evidence_refs: line.event_id ? [`event:${line.event_id}`] : [],
      knowledge_refs: [
        ...line.hero_keys_mentioned.map((h) => `hero:${h}`),
        ...line.ability_keys_mentioned.map((a) => `ability:${a}`),
      ],
      style,
      approval_status: 'draft' as const,
    };
  });

  return {
    schema_version: MATCH_COMMENTARY_SEGMENT_SCHEMA_VERSION,
    match_source_id: script.match_source_id,
    timeline_id: script.timeline_id,
    server_environment: script.server_environment,
    game_patch_id: script.game_patch_id,
    language: script.language,
    style,
    segments,
    generated_at: script.generated_at,
    notes: script.notes,
    approval_status: script.approval_status ?? 'draft',
  };
}
