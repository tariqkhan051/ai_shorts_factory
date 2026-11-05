import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTtsProvider } from './create-tts-provider.js';
import { MockTtsProvider } from './mock-tts-provider.js';

describe('TTS providers', () => {
  it('mock synthesizes a wav file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'asf-tts-'));
    const out = join(dir, 'line.wav');
    const provider = new MockTtsProvider();
    const result = await provider.synthesize({
      text: 'Franco hooks the mid laner.',
      voiceId: 'mock-neutral',
      outputPath: out,
    });
    expect(result.durationSeconds).toBeGreaterThan(0.3);
    const info = await stat(out);
    expect(info.size).toBeGreaterThan(44);
  });

  it('defaults to unconfigured without env', () => {
    const provider = createTtsProvider({});
    expect(provider.status).toBe('unconfigured');
  });
});
