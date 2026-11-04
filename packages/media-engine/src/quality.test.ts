import { describe, expect, it } from 'vitest';
import { evaluateQualityGates } from './quality.js';
import type { MediaProbe } from './probe.js';

function probe(overrides?: Partial<MediaProbe>): MediaProbe {
  return {
    path: '/tmp/out.mp4',
    durationSeconds: 30,
    width: 1080,
    height: 1920,
    fps: 30,
    hasVideo: true,
    hasAudio: true,
    formatName: 'mov,mp4',
    raw: {},
    ...overrides,
  };
}

describe('evaluateQualityGates', () => {
  it('passes a compliant vertical short', () => {
    const result = evaluateQualityGates({ probe: probe() });
    expect(result.ok).toBe(true);
  });

  it('fails when duration exceeds 59s', () => {
    const result = evaluateQualityGates({
      probe: probe({ durationSeconds: 60.2 }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.join(' ')).toMatch(/59/);
    }
  });

  it('notes upscaling honesty', () => {
    const result = evaluateQualityGates({
      probe: probe(),
      upscaledFromLowerResolution: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.upscaled).toBe(true);
      expect(result.notes.some((note) => /native 1080p/i.test(note))).toBe(true);
    }
  });
});
