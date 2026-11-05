import { describe, expect, it, vi } from 'vitest';
import { SupabaseMatchStudioRepository } from './supabase-match-studio-repository.js';
import { MemoryMatchCommentaryRepository } from './memory-match-commentary-repository.js';

function createChainMock(result: { data: unknown; error: null | { message: string } }) {
  const chain: Record<string, unknown> = {};
  const api = {
    select: vi.fn(() => api),
    insert: vi.fn(() => api),
    update: vi.fn(() => api),
    eq: vi.fn(() => api),
    order: vi.fn(() => api),
    limit: vi.fn(() => api),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
  };
  Object.assign(chain, api);
  return {
    from: vi.fn(() => api),
  };
}

describe('SupabaseMatchStudioRepository', () => {
  it('maps createRun rows from Supabase', async () => {
    const row = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      user_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      project_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      match_source_id: null,
      title: 'Test match',
      status: 'awaiting_upload',
      patch_resolution: 'bound',
      server_environment: 'original',
      game_profile_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      game_patch_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      last_error: null,
      capability_flags: {},
      commentary_style: 'esports_caster',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    const client = createChainMock({ data: row, error: null });
    const repo = new SupabaseMatchStudioRepository(client as never);
    const created = await repo.createRun(row.user_id, {
      project_id: row.project_id,
      title: row.title,
      patch_resolution: 'bound',
      server_environment: 'original',
      game_profile_id: row.game_profile_id,
      game_patch_id: row.game_patch_id,
      status: 'awaiting_upload',
    });
    expect(created.id).toBe(row.id);
    expect(created.status).toBe('awaiting_upload');
    expect(client.from).toHaveBeenCalledWith('match_studio_runs');
  });

  it('Memory commentary repository persists scripts', async () => {
    const repo = new MemoryMatchCommentaryRepository();
    const saved = await repo.saveScript('user-1', {
      timeline_id: 'tl-1',
      match_source_id: 'src-1',
      server_environment: 'original',
      style: 'esports_caster',
      script: {
        schema_version: 1,
        timeline_id: 'tl-1',
        match_source_id: 'src-1',
        server_environment: 'original',
        game_patch_id: null,
        style: 'esports_caster',
        approval_status: 'draft',
        lines: [],
        notes: '',
      } as never,
    });
    const listed = await repo.listForTimeline('user-1', 'tl-1');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(saved.id);
  });
});
