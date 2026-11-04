import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MockVideoGenerationProvider } from './mock-provider.js';

describe('MockVideoGenerationProvider', () => {
  it('submits idempotently and reports observed cost', async () => {
    const provider = new MockVideoGenerationProvider({ costPerGeneration: 10 });
    const request = {
      idempotencyKey: 'scene-1-attempt-1',
      prompt: 'A neon alley in rain',
      model: 'mock-omni-flash',
      durationSeconds: 6,
      resolution: '720p',
    };

    const first = await provider.submitGeneration(request);
    const second = await provider.submitGeneration(request);
    expect(second.submissionId).toBe(first.submissionId);

    const status = await provider.waitForCompletion(first.submissionId);
    expect(status.state).toBe('completed');

    const cost = await provider.getObservedCreditCost(first.submissionId);
    expect(cost).toBe(10);
  });

  it('downloads a deterministic asset payload', async () => {
    const provider = new MockVideoGenerationProvider();
    const submission = await provider.submitGeneration({
      idempotencyKey: 'download-test',
      prompt: 'test',
      model: 'mock',
      durationSeconds: 6,
      resolution: '720p',
    });

    const dir = await mkdtemp(join(tmpdir(), 'asf-mock-'));
    const dest = join(dir, 'clip.bin');
    try {
      const asset = await provider.downloadAsset(submission.submissionId, dest);
      const bytes = await readFile(dest);
      expect(asset.bytes).toBe(bytes.byteLength);
      expect(asset.sha256).toHaveLength(64);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
