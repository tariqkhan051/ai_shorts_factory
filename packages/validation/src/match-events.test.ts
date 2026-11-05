import { describe, expect, it } from 'vitest';
import {
  emptyEventDetectionConfig,
  matchEventCandidateSchema,
  matchTimelineExportSchema,
  MATCH_TIMELINE_EXPORT_SCHEMA_VERSION,
} from './match-events.js';

describe('match event validation', () => {
  it('defaults event detection config with kill_feed region', () => {
    const config = emptyEventDetectionConfig();
    expect(config.pre_seconds).toBe(3);
    expect(config.recognition.regions[0]?.id).toBe('kill_feed');
  });

  it('accepts a timeline export package', () => {
    const exported = matchTimelineExportSchema.parse({
      schema_version: MATCH_TIMELINE_EXPORT_SCHEMA_VERSION,
      timeline_id: '11111111-1111-1111-1111-111111111111',
      match_source_id: '22222222-2222-2222-2222-222222222222',
      status: 'corrected',
      server_environment: 'original',
      game_patch_id: '33333333-3333-3333-3333-333333333333',
      events: [
        matchEventCandidateSchema.parse({
          id: '44444444-4444-4444-4444-444444444444',
          event_type: 'kill',
          timestamp_seconds: 12,
          confidence: 0.9,
          windows: [
            { phase: 'pre', start_seconds: 9, end_seconds: 12 },
            { phase: 'main', start_seconds: 12, end_seconds: 14 },
            { phase: 'post', start_seconds: 14, end_seconds: 17 },
          ],
        }),
      ],
      exported_at: '2026-11-05T12:00:00.000Z',
    });
    expect(exported.events).toHaveLength(1);
  });
});
