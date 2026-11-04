import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assembleProject } from './assemble.js';
import { resolveMediaToolPaths } from './paths.js';
import { runCommand } from './run-command.js';

async function ffmpegAvailable(): Promise<boolean> {
  try {
    const paths = resolveMediaToolPaths();
    const result = await runCommand(paths.ffmpeg, ['-version'], { timeoutMs: 10_000 });
    return result.code === 0;
  } catch {
    return false;
  }
}

describe('assembleProject', () => {
  it('assembles five placeholder scenes under 59s at 1080x1920', async () => {
    if (!(await ffmpegAvailable())) {
      return;
    }

    const root = await mkdtemp(join(tmpdir(), 'asf-assemble-'));
    const fakeScene = join(root, 'fake-scene.bin');
    await writeFile(fakeScene, Buffer.from('not-a-video'));

    const result = await assembleProject({
      workDir: join(root, 'work'),
      outputPath: join(root, 'final.mp4'),
      allowSyntheticPlaceholders: true,
      scenes: [1, 2, 3, 4, 5].map((sceneNumber) => ({
        sceneNumber,
        path: fakeScene,
        durationSeconds: 6,
      })),
    });

    expect(result.quality.ok).toBe(true);
    expect(result.usedSyntheticPlaceholders).toBe(true);
    expect(result.probe.width).toBe(1080);
    expect(result.probe.height).toBe(1920);
    expect(result.probe.durationSeconds).toBeLessThanOrEqual(59);
    expect(result.probe.durationSeconds).toBeGreaterThan(20);
  }, 120_000);
});
