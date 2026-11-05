import { randomUUID } from 'node:crypto';
import {
  MATCH_EDIT_DEFAULTS,
  type MatchEventType,
} from '@ai-shorts-factory/shared-types';
import {
  MATCH_EDIT_PLAN_SCHEMA_VERSION,
  emptyMatchEditPlanConfig,
  matchEditPlanSchema,
  type MatchEditPlan,
  type MatchEditPlanConfig,
  type MatchEditSegment,
  type MatchEditShortCandidate,
  type MatchEventCandidate,
} from '@ai-shorts-factory/validation';
import type { MatchTimelineWithEvents } from './match-event-types.js';

export type BuildMatchEditPlanInput = {
  timeline: MatchTimelineWithEvents;
  sourceDurationSeconds: number;
  config?: Partial<MatchEditPlanConfig>;
  notes?: string;
};

type Span = {
  event_id: string | null;
  event_type: MatchEventType | null;
  start: number;
  end: number;
  confidence: number;
};

function eventSpan(
  event: MatchEventCandidate,
  prePad: number,
  postPad: number,
): Span {
  const windows = event.windows;
  if (windows && windows.length === 3) {
    const pre = windows.find((w) => w.phase === 'pre');
    const post = windows.find((w) => w.phase === 'post');
    const main = windows.find((w) => w.phase === 'main');
    const start = pre?.start_seconds ?? Math.max(0, event.timestamp_seconds - prePad);
    const end =
      post?.end_seconds ??
      (main?.end_seconds ?? event.timestamp_seconds) + postPad;
    return {
      event_id: event.id ?? null,
      event_type: event.event_type,
      start,
      end: Math.max(start + 0.1, end),
      confidence: event.confidence,
    };
  }
  const start = Math.max(0, event.timestamp_seconds - prePad);
  const end = event.timestamp_seconds + postPad;
  return {
    event_id: event.id ?? null,
    event_type: event.event_type,
    start,
    end: Math.max(start + 0.1, end),
    confidence: event.confidence,
  };
}

function mergeOverlappingSpans(spans: Span[]): Span[] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Span[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (current.start <= last.end + 0.05) {
      last.end = Math.max(last.end, current.end);
      if (current.confidence > last.confidence) {
        last.event_id = current.event_id;
        last.event_type = current.event_type;
        last.confidence = current.confidence;
      }
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

function segmentOutputDuration(segment: MatchEditSegment): number {
  const span = segment.source_end_seconds - segment.source_start_seconds;
  return span / Math.max(0.25, segment.speed);
}

function shortPriority(eventType: MatchEventType): number {
  const list = MATCH_EDIT_DEFAULTS.short_priority_types as readonly string[];
  const idx = list.indexOf(eventType);
  return idx === -1 ? list.length : idx;
}

/**
 * Build a condensed edit plan (highlight pads + boring speed-up) and 1–2 Short candidates.
 */
export function buildMatchEditPlan(input: BuildMatchEditPlanInput): MatchEditPlan {
  const config = emptyMatchEditPlanConfig({
    pre_pad_seconds: MATCH_EDIT_DEFAULTS.pre_pad_seconds,
    post_pad_seconds: MATCH_EDIT_DEFAULTS.post_pad_seconds,
    boring_speed: MATCH_EDIT_DEFAULTS.boring_speed,
    min_gap_for_boring_seconds: MATCH_EDIT_DEFAULTS.min_gap_for_boring_seconds,
    condensed_max_seconds: MATCH_EDIT_DEFAULTS.condensed_max_seconds,
    short_max_seconds: MATCH_EDIT_DEFAULTS.short_max_seconds,
    max_shorts: MATCH_EDIT_DEFAULTS.max_shorts,
    short_min_confidence: MATCH_EDIT_DEFAULTS.short_min_confidence,
    ...input.config,
  });

  const sourceDuration = Math.max(0, input.sourceDurationSeconds);
  const activeEvents = input.timeline.events.filter((e) => !e.rejected && e.id);

  const highlightSpans = mergeOverlappingSpans(
    activeEvents.map((event) =>
      eventSpan(event, config.pre_pad_seconds, config.post_pad_seconds),
    ),
  ).map((span) => ({
    ...span,
    start: Math.max(0, Math.min(span.start, sourceDuration)),
    end: Math.max(0, Math.min(span.end, sourceDuration || span.end)),
  }));

  const condensed_segments: MatchEditSegment[] = [];
  let cursor = 0;
  for (const span of highlightSpans) {
    if (span.start > cursor + 0.05) {
      const gap = span.start - cursor;
      if (gap >= config.min_gap_for_boring_seconds) {
        condensed_segments.push({
          id: randomUUID(),
          kind: 'boring',
          event_id: null,
          event_type: null,
          source_start_seconds: cursor,
          source_end_seconds: span.start,
          speed: config.boring_speed,
        });
      } else if (gap > 0.05) {
        // Small gaps stay realtime so we do not chop mid-action.
        condensed_segments.push({
          id: randomUUID(),
          kind: 'highlight',
          event_id: null,
          event_type: null,
          source_start_seconds: cursor,
          source_end_seconds: span.start,
          speed: 1,
        });
      }
    }
    if (span.end > span.start) {
      condensed_segments.push({
        id: randomUUID(),
        kind: 'highlight',
        event_id: span.event_id,
        event_type: span.event_type,
        source_start_seconds: span.start,
        source_end_seconds: span.end,
        speed: 1,
      });
    }
    cursor = Math.max(cursor, span.end);
  }

  if (sourceDuration > cursor + 0.05) {
    const gap = sourceDuration - cursor;
    if (gap >= config.min_gap_for_boring_seconds) {
      condensed_segments.push({
        id: randomUUID(),
        kind: 'boring',
        event_id: null,
        event_type: null,
        source_start_seconds: cursor,
        source_end_seconds: sourceDuration,
        speed: config.boring_speed,
      });
    } else if (gap > 0.05) {
      condensed_segments.push({
        id: randomUUID(),
        kind: 'highlight',
        event_id: null,
        event_type: null,
        source_start_seconds: cursor,
        source_end_seconds: sourceDuration,
        speed: 1,
      });
    }
  }

  // If no events, keep a realtime skim of the whole source (still capped later).
  if (condensed_segments.length === 0 && sourceDuration > 0) {
    condensed_segments.push({
      id: randomUUID(),
      kind: 'boring',
      event_id: null,
      event_type: null,
      source_start_seconds: 0,
      source_end_seconds: sourceDuration,
      speed: config.boring_speed,
    });
  }

  const condensed_duration_seconds = condensed_segments.reduce(
    (sum, segment) => sum + segmentOutputDuration(segment),
    0,
  );

  const shortCandidates = [...activeEvents]
    .filter((e) => e.confidence >= config.short_min_confidence && e.id)
    .sort((a, b) => {
      const p = shortPriority(a.event_type) - shortPriority(b.event_type);
      if (p !== 0) return p;
      return b.confidence - a.confidence;
    })
    .slice(0, config.max_shorts);

  const shorts: MatchEditShortCandidate[] = shortCandidates.map((event, index) => {
    const span = eventSpan(event, config.pre_pad_seconds, config.post_pad_seconds);
    const start = Math.max(0, Math.min(span.start, sourceDuration || span.start));
    let end = Math.max(start + 0.1, Math.min(span.end, sourceDuration || span.end));
    let duration = end - start;
    if (duration > config.short_max_seconds) {
      end = start + config.short_max_seconds;
      duration = config.short_max_seconds;
    }
    return {
      id: randomUUID(),
      rank: (index + 1) as 1 | 2,
      event_id: event.id!,
      event_type: event.event_type,
      confidence: event.confidence,
      source_start_seconds: start,
      source_end_seconds: end,
      duration_seconds: duration,
      caption_event_ids: [event.id!],
    };
  });

  return matchEditPlanSchema.parse({
    schema_version: MATCH_EDIT_PLAN_SCHEMA_VERSION,
    id: randomUUID(),
    timeline_id: input.timeline.id,
    match_source_id: input.timeline.match_source_id,
    server_environment: input.timeline.server_environment,
    game_patch_id: input.timeline.game_patch_id,
    source_duration_seconds: sourceDuration,
    config,
    condensed_segments,
    condensed_duration_seconds,
    shorts,
    created_at: new Date().toISOString(),
    notes: input.notes ?? '',
  });
}
