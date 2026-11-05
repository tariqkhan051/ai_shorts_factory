import {
  mapSourceTimeToEditTime,
  type MatchEditCutSegment,
  type TimedCaptionCue,
} from '@ai-shorts-factory/media-engine';
import type {
  MatchCommentaryScript,
  MatchEditPlan,
  MatchEditShortCandidate,
} from '@ai-shorts-factory/validation';

function toCutSegments(
  planSegments: MatchEditPlan['condensed_segments'],
): MatchEditCutSegment[] {
  return planSegments.map((segment) => ({
    sourceStartSeconds: segment.source_start_seconds,
    sourceEndSeconds: segment.source_end_seconds,
    speed: segment.speed,
  }));
}

/**
 * Remap commentary lines (source timestamps) onto the condensed edit timeline for SRT burn-in.
 */
export function buildCondensedCaptionCues(input: {
  plan: MatchEditPlan;
  commentary?: MatchCommentaryScript | null;
  holdSeconds?: number;
}): TimedCaptionCue[] {
  if (!input.commentary) return [];
  const cuts = toCutSegments(input.plan.condensed_segments);
  const hold = input.holdSeconds ?? 2.5;
  const cues: TimedCaptionCue[] = [];

  for (const line of input.commentary.lines) {
    const sourceTs = line.timestamp_seconds;
    if (sourceTs == null || !line.text.trim()) continue;
    const editStart = mapSourceTimeToEditTime(sourceTs, cuts);
    if (editStart == null) continue;
    cues.push({
      startSeconds: editStart,
      endSeconds: editStart + hold,
      text: line.text.trim(),
    });
  }

  return cues.sort((a, b) => a.startSeconds - b.startSeconds);
}

/**
 * Captions for a single Short — only lines tied to the Short's event(s).
 */
export function buildShortCaptionCues(input: {
  short: MatchEditShortCandidate;
  commentary?: MatchCommentaryScript | null;
  holdSeconds?: number;
}): TimedCaptionCue[] {
  if (!input.commentary) return [];
  const allowed = new Set(input.short.caption_event_ids);
  const hold = input.holdSeconds ?? 2.5;
  const cues: TimedCaptionCue[] = [];

  for (const line of input.commentary.lines) {
    if (!line.event_id || !allowed.has(line.event_id)) continue;
    if (!line.text.trim()) continue;
    const sourceTs = line.timestamp_seconds ?? input.short.source_start_seconds;
    const relative = Math.max(0, sourceTs - input.short.source_start_seconds);
    if (relative > input.short.duration_seconds) continue;
    cues.push({
      startSeconds: relative,
      endSeconds: Math.min(input.short.duration_seconds, relative + hold),
      text: line.text.trim(),
    });
  }

  return cues.sort((a, b) => a.startSeconds - b.startSeconds);
}
