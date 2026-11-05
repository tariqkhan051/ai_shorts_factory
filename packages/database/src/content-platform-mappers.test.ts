import { describe, expect, it } from 'vitest';
import {
  mapBrandRow,
  mapDistributionRow,
  mapDnaVersionRow,
  mapEnvironmentRow,
  mapSocialAccountRow,
  mapVideoContextSnapshot,
  mapVideoRow,
} from './content-platform-mappers.js';

describe('content platform mappers', () => {
  it('maps brand rows with color defaults', () => {
    const brand = mapBrandRow({
      id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-2222-2222-222222222222',
      name: 'Arena',
      description: 'desc',
      logo_asset_id: null,
      colors: { primary: '#111', extra: ['#222'] },
      default_watermark_asset_id: null,
      target_audience: 'fans',
      brand_voice: 'bold',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null,
    });
    expect(brand.name).toBe('Arena');
    expect(brand.colors.primary).toBe('#111');
    expect(brand.colors.extra).toEqual(['#222']);
  });

  it('maps DNA versions and fills snapshot defaults', () => {
    const dna = mapDnaVersionRow({
      id: '11111111-1111-1111-1111-111111111111',
      project_id: '22222222-2222-2222-2222-222222222222',
      version: 2,
      snapshot: {
        identity: { name: 'MLBB', content_niche: 'cinematic' },
      },
      note: 'v2',
      created_by: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(dna.version).toBe(2);
    expect(dna.snapshot.identity.content_niche).toBe('cinematic');
    expect(dna.snapshot.production_defaults.aspect_ratio).toBe('9:16');
  });

  it('maps video rows and redacts social secrets', () => {
    const video = mapVideoRow({
      id: '11111111-1111-1111-1111-111111111111',
      project_id: '22222222-2222-2222-2222-222222222222',
      user_id: '33333333-3333-3333-3333-333333333333',
      title: 'The Fallen Warrior',
      concept: 'Betrayal',
      story_brief: '',
      special_instructions: '',
      workflow_state: 'IDEA_SUBMITTED',
      captions_on_video: true,
      project_dna_version: 3,
      context_snapshot: {
        project_id: '22222222-2222-2222-2222-222222222222',
        project_dna_version: 3,
        content_niche: 'MLBB',
        visual_style: 'realistic_cinematic',
        language: 'en',
        target_audience: 'fans',
        continuity_policy: 'reuse existing project characters',
        production_defaults: { captions_on_video: true },
        prompt_instructions: {},
      },
      approved_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null,
    });
    expect(video.title).toBe('The Fallen Warrior');
    expect(video.context_snapshot.content_niche).toBe('MLBB');
    expect(mapVideoContextSnapshot(video.context_snapshot).project_dna_version).toBe(3);

    const account = mapSocialAccountRow(
      {
        id: '11111111-1111-1111-1111-111111111111',
        user_id: '22222222-2222-2222-2222-222222222222',
        brand_id: null,
        platform: 'youtube',
        display_name: 'Arena',
        handle: '@arena',
        connection_status: 'registered',
        publishing_enabled: false,
        default_caption_rules: '',
        default_hashtag_rules: '',
        default_content_format: '9:16',
        account_preferences: {},
        secret_ref: 'secret-token-value',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        deleted_at: null,
      },
      { redactSecret: true },
    );
    expect(account.secret_ref).toBe('[redacted]');
    expect(account.connection_status).toBe('registered');
    expect(account.publishing_enabled).toBe(false);
  });

  it('maps environments and distribution metadata', () => {
    const env = mapEnvironmentRow({
      id: '11111111-1111-1111-1111-111111111111',
      project_id: '22222222-2222-2222-2222-222222222222',
      user_id: '33333333-3333-3333-3333-333333333333',
      name: 'Citadel',
      kind: 'building',
      description: 'Dark',
      visual_identity: 'stone',
      continuity_rules: '',
      reference_image_prompt: '',
      active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    expect(env.kind).toBe('building');

    const dist = mapDistributionRow({
      id: '11111111-1111-1111-1111-111111111111',
      video_id: '22222222-2222-2222-2222-222222222222',
      project_id: '33333333-3333-3333-3333-333333333333',
      social_account_id: '44444444-4444-4444-4444-444444444444',
      platform: 'tiktok',
      target_format: '9:16',
      caption: 'Watch',
      hashtags: ['shorts'],
      thumbnail_asset_id: null,
      derived_asset_id: null,
      status: 'draft',
      scheduled_at: null,
      published_url: null,
      platform_reference_id: null,
      failure_reason: null,
      retry_history: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    expect(dist.platform).toBe('tiktok');
    expect(dist.hashtags).toEqual(['shorts']);
  });
});
