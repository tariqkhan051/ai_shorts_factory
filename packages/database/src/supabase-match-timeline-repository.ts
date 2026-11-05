import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
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

type EventRow = {
  id: string;
  timeline_id: string;
  event_type: MatchEventCandidate['event_type'];
  timestamp_seconds: number;
  confidence: number;
  participants: MatchEventCandidate['participants'];
  evidence: MatchEventCandidate['evidence'];
  windows: MatchEventCandidate['windows'];
  notes: string;
  rejected: boolean;
  source: MatchEventCandidate['source'];
  original_prediction?: Record<string, unknown> | null;
  corrected_by?: string | null;
  corrected_at?: string | null;
  review_status?: string;
  created_at: string;
  updated_at: string;
};

function mapEvent(row: EventRow): MatchEventCandidate {
  return {
    id: row.id,
    event_type: row.event_type,
    timestamp_seconds: row.timestamp_seconds,
    confidence: row.confidence,
    participants: row.participants ?? [],
    evidence: row.evidence ?? [],
    windows: row.windows ?? [],
    notes: row.notes ?? '',
    rejected: Boolean(row.rejected),
    source: row.source ?? 'detector',
  };
}

function eventInsertRow(timelineId: string, event: MatchEventCandidate) {
  return {
    id: event.id ?? randomUUID(),
    timeline_id: timelineId,
    event_type: event.event_type,
    timestamp_seconds: event.timestamp_seconds,
    confidence: event.confidence,
    participants: event.participants ?? [],
    evidence: event.evidence ?? [],
    windows: event.windows ?? [],
    notes: event.notes ?? '',
    rejected: event.rejected ?? false,
    source: event.source ?? 'detector',
  };
}

export class SupabaseMatchTimelineRepository implements MatchTimelineRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async loadWithEvents(
    userId: string,
    timelineId: string,
  ): Promise<MatchTimelineWithEvents | null> {
    const { data: timeline, error } = await this.client
      .from('match_timelines')
      .select('*')
      .eq('id', timelineId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load timeline: ${error.message}`);
    if (!timeline) return null;

    const { data: source } = await this.client
      .from('match_sources')
      .select('server_environment, game_patch_id')
      .eq('id', timeline.match_source_id)
      .eq('user_id', userId)
      .maybeSingle();

    const { data: events, error: eventsError } = await this.client
      .from('match_events')
      .select('*')
      .eq('timeline_id', timelineId)
      .order('timestamp_seconds', { ascending: true });
    if (eventsError) throw new Error(`Failed to load events: ${eventsError.message}`);

    return {
      id: timeline.id,
      user_id: timeline.user_id,
      match_source_id: timeline.match_source_id,
      status: timeline.status,
      detection_config: timeline.detection_config,
      cache_key: timeline.cache_key,
      notes: timeline.notes ?? '',
      created_at: timeline.created_at,
      updated_at: timeline.updated_at,
      events: ((events ?? []) as EventRow[]).map(mapEvent),
      server_environment: source?.server_environment ?? 'original',
      game_patch_id: source?.game_patch_id ?? '',
    };
  }

  async getTimeline(
    userId: string,
    timelineId: string,
  ): Promise<MatchTimelineWithEvents | null> {
    return this.loadWithEvents(userId, timelineId);
  }

  async getTimelineByCacheKey(
    userId: string,
    matchSourceId: string,
    cacheKey: string,
  ): Promise<MatchTimelineWithEvents | null> {
    const { data, error } = await this.client
      .from('match_timelines')
      .select('id')
      .eq('user_id', userId)
      .eq('match_source_id', matchSourceId)
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (error) throw new Error(`Failed to lookup timeline cache: ${error.message}`);
    if (!data) return null;
    return this.loadWithEvents(userId, data.id);
  }

  async listTimelinesForSource(
    userId: string,
    matchSourceId: string,
  ): Promise<MatchTimelineWithEvents[]> {
    const { data, error } = await this.client
      .from('match_timelines')
      .select('id')
      .eq('user_id', userId)
      .eq('match_source_id', matchSourceId)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(`Failed to list timelines: ${error.message}`);
    const results: MatchTimelineWithEvents[] = [];
    for (const row of data ?? []) {
      const full = await this.loadWithEvents(userId, row.id);
      if (full) results.push(full);
    }
    return results;
  }

  async saveTimeline(
    userId: string,
    timeline: MatchTimelineWithEvents,
  ): Promise<MatchTimelineWithEvents> {
    if (timeline.user_id !== userId) throw new Error('Timeline user mismatch');

    const { data: saved, error } = await this.client
      .from('match_timelines')
      .upsert(
        {
          id: timeline.id,
          user_id: userId,
          match_source_id: timeline.match_source_id,
          status: timeline.status,
          detection_config: timeline.detection_config,
          cache_key: timeline.cache_key,
          notes: timeline.notes ?? '',
        },
        { onConflict: 'id' },
      )
      .select('*')
      .single();
    if (error || !saved) {
      throw new Error(`Failed to save timeline: ${error?.message ?? 'unknown'}`);
    }

    const { error: deleteError } = await this.client
      .from('match_events')
      .delete()
      .eq('timeline_id', saved.id);
    if (deleteError) throw new Error(`Failed to reset events: ${deleteError.message}`);

    if (timeline.events.length > 0) {
      const rows = timeline.events.map((event) => eventInsertRow(saved.id, event));
      const { error: insertError } = await this.client.from('match_events').insert(rows);
      if (insertError) throw new Error(`Failed to save events: ${insertError.message}`);
    }

    const reloaded = await this.loadWithEvents(userId, saved.id);
    if (!reloaded) throw new Error('Timeline disappeared after save');
    return reloaded;
  }

  async correctEvent(
    userId: string,
    timelineId: string,
    input: CorrectMatchEventPayload,
  ): Promise<MatchTimelineWithEvents> {
    const parsed = correctMatchEventSchema.parse(input);
    const timeline = await this.getTimeline(userId, timelineId);
    if (!timeline) throw new Error('Timeline not found');
    const existing = timeline.events.find((event) => event.id === parsed.event_id);
    if (!existing) throw new Error('Event not found');

    const { data: priorRow } = await this.client
      .from('match_events')
      .select('original_prediction, source')
      .eq('id', parsed.event_id)
      .eq('timeline_id', timelineId)
      .maybeSingle();

    const originalPrediction =
      priorRow?.original_prediction ??
      (priorRow?.source === 'detector'
        ? {
            event_type: existing.event_type,
            timestamp_seconds: existing.timestamp_seconds,
            confidence: existing.confidence,
            participants: existing.participants,
            notes: existing.notes,
            rejected: existing.rejected,
          }
        : null);

    const timestamp = parsed.timestamp_seconds ?? existing.timestamp_seconds;
    const { error } = await this.client
      .from('match_events')
      .update({
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
        original_prediction: originalPrediction,
        corrected_by: userId,
        corrected_at: new Date().toISOString(),
        review_status: parsed.rejected ? 'rejected' : 'approved',
      })
      .eq('id', parsed.event_id)
      .eq('timeline_id', timelineId);
    if (error) throw new Error(`Failed to correct event: ${error.message}`);

    await this.client
      .from('match_timelines')
      .update({ status: 'corrected' })
      .eq('id', timelineId)
      .eq('user_id', userId);

    const reloaded = await this.getTimeline(userId, timelineId);
    if (!reloaded) throw new Error('Timeline disappeared after correction');
    return reloaded;
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

    const { error } = await this.client.from('match_events').insert({
      ...eventInsertRow(timelineId, event),
      review_status: 'approved',
      corrected_by: userId,
      corrected_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Failed to add manual event: ${error.message}`);

    await this.client
      .from('match_timelines')
      .update({ status: 'corrected' })
      .eq('id', timelineId)
      .eq('user_id', userId);

    const reloaded = await this.getTimeline(userId, timelineId);
    if (!reloaded) throw new Error('Timeline disappeared after manual event');
    return reloaded;
  }

  async setStatus(
    userId: string,
    timelineId: string,
    status: MatchTimelineStatus,
  ): Promise<MatchTimelineWithEvents> {
    const { error } = await this.client
      .from('match_timelines')
      .update({ status })
      .eq('id', timelineId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to update timeline status: ${error.message}`);
    const reloaded = await this.getTimeline(userId, timelineId);
    if (!reloaded) throw new Error('Timeline not found');
    return reloaded;
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
      exported_at: new Date().toISOString(),
    };
  }
}
