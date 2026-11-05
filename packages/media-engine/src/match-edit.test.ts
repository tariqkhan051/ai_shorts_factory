import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mapSourceTimeToEditTime, renderMatchEdit } from './match-edit.js';
import { evaluateMatchEditQualityGates } from './match-edit-quality.js';
import { resolveMediaToolPaths } from './paths.js';
import { runCommand } from './run-command.js';
import { synthesizeColorClip } from './synthesize.js';

async function ffmpegAvailable(): Promise<boolean> {
  try {
    const paths = resolveMediaToolPaths();
    const result = await runCommand(paths.ffmpeg, ['-version'], { timeoutMs: 10_000 });
    return result.code === 0;
  } catch {
    return false;
  }
}

describe('match edit media (Milestone 6)', () => {
  let workDir = '';

  afterEach(async () => {
    if (!workDir) return;
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Windows may briefly lock FFmpeg outputs; temp cleanup is best-effort.
    }
    workDir = '';
  });

  it('maps source timestamps through boring speed-ups', () => {
    const editTime = mapSourceTimeToEditTime(24, [
      { sourceStartSeconds: 0, sourceEndSeconds: 20, speed: 4 },
      { sourceStartSeconds: 20, sourceEndSeconds: 28, speed: 1 },
    ]);
    // 20s @4x = 5s, then +4s into highlight = 9s
    expect(editTime).toBeCloseTo(9, 5);
  });

  it('allows longer condensed max than Shorts', () => {
    const baseProbe = {
      path: 'x',
      durationSeconds: 70,
      width: 1080,
      height: 1920,
      fps: 30,
      hasVideo: true,
      hasAudio: false,
      formatName: 'mp4',
      videoCodec: 'h264',
      audioCodec: null,
      raw: {},
    };

    const shortFail = evaluateMatchEditQualityGates({
      profile: 'short',
      probe: baseProbe,
    });
    expect(shortFail.ok).toBe(false);

    const condensedOk = evaluateMatchEditQualityGates({
      profile: 'condensed',
      maxSeconds: 180,
      probe: baseProbe,
    });
    expect(condensedOk.ok).toBe(true);
  });

  it(
    'renders vertical highlight + sped boring segments under condensed max',
    async () => {
      if (!(await ffmpegAvailable())) return;

      workDir = await mkdtemp(join(tmpdir(), 'asf-match-edit-'));
      const paths = resolveMediaToolPaths();
      const source = join(workDir, 'source.mp4');
      await synthesizeColorClip(paths, {
        outputPath: source,
        durationSeconds: 12,
        width: 720,
        height: 1280,
        fps: 30,
        color: '0x1abc9c',
        label: 'match-edit-source',
      });

      const result = await renderMatchEdit({
        sourceVideoPath: source,
        segments: [
          { sourceStartSeconds: 0, sourceEndSeconds: 8, speed: 4 },
          { sourceStartSeconds: 8, sourceEndSeconds: 12, speed: 1 },
        ],
        workDir: join(workDir, 'work'),
        outputPath: join(workDir, 'out.mp4'),
        profile: 'condensed',
        maxSeconds: 180,
        burnCaptions: false,
        paths,
      });

      expect(result.quality.ok).toBe(true);
      expect(result.probe.width).toBe(1080);
      expect(result.probe.height).toBe(1920);
      expect(result.durationSeconds).toBeLessThanOrEqual(180);
      // ~2s boring + 4s highlight
      expect(result.durationSeconds).toBeGreaterThan(4);
      expect(result.durationSeconds).toBeLessThan(8);
    },
    60_000,
  );
});
