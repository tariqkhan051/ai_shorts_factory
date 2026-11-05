import { describe, expect, it } from 'vitest';
import { emptyProjectDnaSnapshot, parseProjectDnaSnapshot } from './project-dna.js';
import { parseCreateVideo } from './video.js';
import { parseCreateBrand } from './brand.js';
import { parseCreateSocialAccount } from './social-account.js';
import { parseCreateDistribution } from './distribution.js';

describe('project DNA + platform schemas', () => {
  it('builds a complete empty DNA snapshot with defaults', () => {
    const snapshot = emptyProjectDnaSnapshot({
      identity: { name: 'MLBB', content_niche: 'cinematic' },
    });
    expect(snapshot.identity.name).toBe('MLBB');
    expect(snapshot.production_defaults.aspect_ratio).toBe('9:16');
    expect(snapshot.visual.default_visual_style).toBe('automatic');
  });

  it('parses a DNA snapshot rigidly', () => {
    const parsed = parseProjectDnaSnapshot(
      emptyProjectDnaSnapshot({ identity: { name: 'X' } }),
    );
    expect(parsed.identity.name).toBe('X');
  });

  it('requires a video concept', () => {
    expect(() => parseCreateVideo({ concept: '' })).toThrow();
    expect(parseCreateVideo({ concept: 'The Fallen Warrior' }).concept).toBe(
      'The Fallen Warrior',
    );
  });

  it('parses brand and social registration payloads', () => {
    expect(parseCreateBrand({ name: 'Arena' }).name).toBe('Arena');
    const account = parseCreateSocialAccount({
      platform: 'tiktok',
      display_name: 'Arena TT',
      handle: '@arena',
    });
    expect(account.platform).toBe('tiktok');
  });

  it('parses distribution destination metadata', () => {
    const dist = parseCreateDistribution({
      social_account_id: '11111111-1111-1111-1111-111111111111',
      caption: 'Watch now',
      hashtags: ['shorts'],
    });
    expect(dist.target_format).toBe('9:16');
    expect(dist.hashtags).toEqual(['shorts']);
  });
});
