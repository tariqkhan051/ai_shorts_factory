import { describe, expect, it } from 'vitest';
import {
  MATCH_EDIT_PLAN_SCHEMA_VERSION,
  emptyMatchEditPlanConfig,
  matchEditPlanSchema,
  parseMatchEditPlan,
} from './match-edit.js';

describe('match edit validation', () => {
  it('defaults plan config for condensed + Shorts', () => {
    const config = emptyMatchEditPlanConfig();
    expect(config.boring_speed).toBe(4);
    expect(config.short_max_seconds).toBe(59);
    expect(config.max_shorts).toBe(2);
  });

  it('accepts a match-edit-plan-v1 package', () => {
    const plan = parseMatchEditPlan({
      schema_version: MATCH_EDIT_PLAN_SCHEMA_VERSION,
      id: '11111111-1111-1111-1111-111111111111',
      timeline_id: '22222222-2222-2222-2222-222222222222',
      match_source_id: '33333333-3333-3333-3333-333333333333',
      server_environment: 'original',
      game_patch_id: '44444444-4444-4444-4444-444444444444',
      source_duration_seconds: 60,
      config: emptyMatchEditPlanConfig(),
      condensed_segments: [
        {
          id: '55555555-5555-5555-5555-555555555555',
          kind: 'boring',
          event_id: null,
          event_type: null,
          source_start_seconds: 0,
          source_end_seconds: 20,
          speed: 4,
        },
        {
          id: '66666666-6666-6666-6666-666666666666',
          kind: 'highlight',
          event_id: '77777777-7777-7777-7777-777777777777',
          event_type: 'kill',
          source_start_seconds: 20,
          source_end_seconds: 28,
          speed: 1,
        },
      ],
      condensed_duration_seconds: 13,
      shorts: [
        {
          id: '88888888-8888-8888-8888-888888888888',
          rank: 1,
          event_id: '77777777-7777-7777-7777-777777777777',
          event_type: 'kill',
          confidence: 0.9,
          source_start_seconds: 20,
          source_end_seconds: 28,
          duration_seconds: 8,
          caption_event_ids: ['77777777-7777-7777-7777-777777777777'],
        },
      ],
      created_at: '2026-11-05T12:00:00.000Z',
    });
    expect(plan.schema_version).toBe(MATCH_EDIT_PLAN_SCHEMA_VERSION);
    expect(matchEditPlanSchema.safeParse(plan).success).toBe(true);
  });
});
