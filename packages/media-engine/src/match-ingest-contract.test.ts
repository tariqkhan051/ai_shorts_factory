import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT,
  validateProbeAgainstContract,
} from './media-contract.js';
import {
  DEFAULT_MATCH_INGEST_MEDIA_CONTRACT,
  validateMatchIngestProbe,
} from './match-ingest-contract.js';
import type { MediaProbe } from './probe.js';

function probe(overrides: Partial<MediaProbe> = {}): MediaProbe {
  return {
    path: 'x.mp4',
    durationSeconds: 1800,
    width: 1080,
    height: 1920,
    fps: 30,
    hasVideo: true,
    hasAudio: true,
    formatName: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    raw: {},
    ...overrides,
  };
}

describe('Match ingest vs Flow import contracts', () => {
  it('accepts long Android recording under Match Studio contract', () => {
    const result = validateMatchIngestProbe(probe(), DEFAULT_MATCH_INGEST_MEDIA_CONTRACT);
    expect(result.ok).toBe(true);
  });

  it('rejects the same long clip under Flow import contract', () => {
    const result = validateProbeAgainstContract(probe(), DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT);
    expect(result.ok).toBe(false);
  });
});
