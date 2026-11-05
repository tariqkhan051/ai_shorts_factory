import { randomUUID } from 'node:crypto';
import type { MatchTimelineStatus } from '@ai-shorts-factory/shared-types';
import {
  MATCH_TIMELINE_EXPORT_SCHEMA_VERSION,
  addManualMatchEventSchema,
  correctMatchEventSchema,
  type AddManualMatchEventPayload,
  type CorrectMatchEventPayload,
  type MatchEventCandidate,
  type MatchTimelineExport,
} from '@ai-shorts-factory/validation';
import { buildEventWindows } from './match-event-detect.js';
import type {
  MatchTimelineRepository,
  MatchTimelineWithEvents,
} from './match-event-types.js';

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryMatchTimelineRepository implements MatchTimelineRepository {
  private readonly timelines = new Map<string, MatchTimelineWithEvents>();

  clear(): void {
    this.timelines.clear();
  }

  async getTimeline(
    userId: string,
    timelineId: string,
  ): Promise<MatchTimelineWithEvents | null> {
    const timeline = this.timelines.get(timelineId);
    if (!timeline || timeline.user_id !== userId) return null;
    return structuredClone(timeline);
  }

  async getTimelineByCacheKey(
    userId: string,
    matchSourceId: string,
    cacheKey: string,
  ): Promise<MatchTimelineWithEvents | null> {
    const timeline = [...this.timelines.values()].find(
      (t) =>
        t.user_id === userId &&
        t.match_source_id === matchSourceId &&
        t.cache_key === cacheKey,
    );
    return timeline ? structuredClone(timeline) : null;
  }

  async listTimelinesForSource(
    userId: string,
    matchSourceId: string,
  ): Promise<MatchTimelineWithEvents[]> {
    return [...this.timelines.values()]
      .filter((t) => t.user_id === userId && t.match_source_id === matchSourceId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((t) => structuredClone(t));
  }

  async saveTimeline(
    userId: string,
    timeline: MatchTimelineWithEvents,
  ): Promise<MatchTimelineWithEvents> {
    if (timeline.user_id !== userId) throw new Error('Timeline user mismatch');
    const saved = {
      ...structuredClone(timeline),
      updated_at: nowIso(),
    };
    this.timelines.set(timeline.id, saved);
    return structuredClone(saved);
  }

  async correctEvent(
    userId: string,
    timelineId: string,
    input: CorrectMatchEventPayload,
  ): Promise<MatchTimelineWithEvents> {
    const parsed = correctMatchEventSchema.parse(input);
    const timeline = await this.getTimeline(userId, timelineId);
    if (!timeline) throw new Error('Timeline not found');
    const index = timeline.events.findIndex((event) => event.id === parsed.event_id);
    if (index < 0) throw new Error('Event not found');
    const existing = timeline.events[index]!;
    const timestamp = parsed.timestamp_seconds ?? existing.timestamp_seconds;
    const updated: MatchEventCandidate = {
      ...existing,
      event_type: parsed.event_type ?? existing.event_type,
      timestamp_seconds: timestamp,
      confidence: parsed.confidence ?? existing.confidence,
      participants: parsed.participants ?? existing.participants,
      notes: parsed.notes ?? existing.notes,
      rejected: parsed.rejected ?? existing.rejected,
      source: 'human',
      windows: buildEventWindows({
        timestampSeconds: timestamp,
        preSeconds: timeline.detection_config.pre_seconds,
        mainSeconds: timeline.detection_config.main_seconds,
        postSeconds: timeline.detection_config.post_seconds,
      }),
    };
    timeline.events[index] = updated;
    timeline.status = 'corrected';
    timeline.events.sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
    return this.saveTimeline(userId, timeline);
  }

  async addManualEvent(
    userId: string,
    timelineId: string,
    input: AddManualMatchEventPayload,
  ): Promise<MatchTimelineWithEvents> {
    const parsed = addManualMatchEventSchema.parse(input);
    const timeline = await this.getTimeline(userId, timelineId);
    if (!timeline) throw new Error('Timeline not found');
    const event: MatchEventCandidate = {
      id: randomUUID(),
      event_type: parsed.event_type,
      timestamp_seconds: parsed.timestamp_seconds,
      confidence: parsed.confidence ?? 1,
      participants: parsed.participants ?? [],
      evidence: [],
      windows: buildEventWindows({
        timestampSeconds: parsed.timestamp_seconds,
        preSeconds: timeline.detection_config.pre_seconds,
        mainSeconds: timeline.detection_config.main_seconds,
        postSeconds: timeline.detection_config.post_seconds,
      }),
      notes: parsed.notes ?? '',
      rejected: false,
      source: 'human',
    };
    timeline.events.push(event);
    timeline.events.sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
    timeline.status = 'corrected';
    return this.saveTimeline(userId, timeline);
  }

  async setStatus(
    userId: string,
    timelineId: string,
    status: MatchTimelineStatus,
  ): Promise<MatchTimelineWithEvents> {
    const timeline = await this.getTimeline(userId, timelineId);
    if (!timeline) throw new Error('Timeline not found');
    timeline.status = status;
    return this.saveTimeline(userId, timeline);
  }

  async exportTimeline(userId: string, timelineId: string): Promise<MatchTimelineExport> {
    const timeline = await this.getTimeline(userId, timelineId);
    if (!timeline) throw new Error('Timeline not found');
    return {
      schema_version: MATCH_TIMELINE_EXPORT_SCHEMA_VERSION,
      timeline_id: timeline.id,
      match_source_id: timeline.match_source_id,
      status: timeline.status,
      server_environment: timeline.server_environment,
      game_patch_id: timeline.game_patch_id,
      events: timeline.events.filter((event) => !event.rejected),
      exported_at: nowIso(),
    };
  }

  exportAll(): MatchTimelineWithEvents[] {
    return [...this.timelines.values()].map((t) => structuredClone(t));
  }

  importAll(records: MatchTimelineWithEvents[]): void {
    this.clear();
    for (const record of records) {
      this.timelines.set(record.id, structuredClone(record));
    }
  }
}
