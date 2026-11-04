import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
  it('assembles five distinct placeholder scenes under 59s at 1080x1920', async () => {
    if (!(await ffmpegAvailable())) {
      return;
    }

    const root = await mkdtemp(join(tmpdir(), 'asf-assemble-'));
    const fakeScenes = await Promise.all(
      [1, 2, 3, 4, 5].map(async (sceneNumber) => {
        const path = join(root, `fake-scene-${sceneNumber}.bin`);
        await writeFile(path, Buffer.from(`not-a-video:${sceneNumber}`));
        return path;
      }),
    );

    const result = await assembleProject({
      workDir: join(root, 'work'),
      outputPath: join(root, 'final.mp4'),
      allowSyntheticPlaceholders: true,
      scenes: fakeScenes.map((path, index) => ({
        sceneNumber: index + 1,
        path,
        durationSeconds: 6,
      })),
    });

    expect(result.quality.ok).toBe(true);
    expect(result.usedSyntheticPlaceholders).toBe(true);
    expect(result.upscaledFromLowerResolution).toBe(true);
    expect(result.probe.width).toBe(1080);
    expect(result.probe.height).toBe(1920);
    expect(result.probe.hasAudio).toBe(true);
    expect(result.probe.durationSeconds).toBeLessThanOrEqual(59);
    expect(result.probe.durationSeconds).toBeGreaterThan(20);
    expect(result.normalizedScenePaths).toHaveLength(5);

    const hashes = new Set<string>();
    for (const scenePath of result.normalizedScenePaths) {
      const digest = createHash('sha256').update(await readFile(scenePath)).digest('hex');
      hashes.add(digest);
    }
    expect(hashes.size).toBe(5);

    const decode = await runCommand(resolveMediaToolPaths().ffmpeg, [
      '-v',
      'error',
      '-i',
      result.outputPath,
      '-f',
      'null',
      '-',
    ]);
    expect(decode.code).toBe(0);
  }, 120_000);

  it('rejects duplicate normalized scene content', async () => {
    if (!(await ffmpegAvailable())) {
      return;
    }

    const root = await mkdtemp(join(tmpdir(), 'asf-assemble-dup-'));
    const real = join(root, 'dup.mp4');
    // Build one real clip, then feed it twice under different scene numbers.
    const { synthesizeColorClip } = await import('./synthesize.js');
    const paths = resolveMediaToolPaths();
    await synthesizeColorClip(paths, {
      outputPath: real,
      durationSeconds: 1,
      width: 1080,
      height: 1920,
      fps: 30,
      color: '0xe74c3c',
      label: 'same',
    });

    await expect(
      assembleProject({
        workDir: join(root, 'work'),
        outputPath: join(root, 'final.mp4'),
        allowSyntheticPlaceholders: false,
        scenes: [
          { sceneNumber: 1, path: real, durationSeconds: 1 },
          { sceneNumber: 2, path: real, durationSeconds: 1 },
        ],
      }),
    ).rejects.toThrow(/Duplicate normalized scene content/i);
  }, 120_000);
});
