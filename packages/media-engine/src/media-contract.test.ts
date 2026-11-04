import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT,
  validateBytesAgainstContract,
  validateProbeAgainstContract,
} from './media-contract.js';
import { probeMedia, assertDecodableVideo } from './probe.js';
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

describe('media contract', () => {
  it('rejects empty and oversized uploads before probe', () => {
    expect(validateBytesAgainstContract(0, DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT)[0]?.code).toBe(
      'empty',
    );
    expect(
      validateBytesAgainstContract(
        DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT.maxUploadBytes + 1,
        DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT,
      )[0]?.code,
    ).toBe('oversized');
  });

  it('rejects missing video / wrong codec / wrong aspect via probe shape', () => {
    const bad = validateProbeAgainstContract(
      {
        path: 'x',
        durationSeconds: 8,
        width: 1280,
        height: 720,
        fps: 30,
        hasVideo: true,
        hasAudio: false,
        formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
        videoCodec: 'vp9',
        audioCodec: null,
        raw: {},
      },
      DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.violations.some((v) => v.code === 'codec')).toBe(true);
      expect(bad.violations.some((v) => v.code === 'aspect')).toBe(true);
    }
  });

  it('accepts valid H.264 vertical probe metadata', () => {
    const ok = validateProbeAgainstContract(
      {
        path: 'x',
        durationSeconds: 8,
        width: 720,
        height: 1280,
        fps: 30,
        hasVideo: true,
        hasAudio: false,
        formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
        videoCodec: 'h264',
        audioCodec: null,
        raw: {},
      },
      DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT,
    );
    expect(ok.ok).toBe(true);
  });

  it('rejects insufficient resolution and duration bounds', () => {
    const lowRes = validateProbeAgainstContract(
      {
        path: 'x',
        durationSeconds: 8,
        width: 360,
        height: 640,
        fps: 30,
        hasVideo: true,
        hasAudio: false,
        formatName: 'mp4',
        videoCodec: 'h264',
        audioCodec: null,
        raw: {},
      },
      DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT,
    );
    expect(lowRes.ok).toBe(false);

    const short = validateProbeAgainstContract(
      {
        path: 'x',
        durationSeconds: 0.2,
        width: 720,
        height: 1280,
        fps: 30,
        hasVideo: true,
        hasAudio: false,
        formatName: 'mp4',
        videoCodec: 'h264',
        audioCodec: null,
        raw: {},
      },
      DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT,
    );
    expect(short.ok).toBe(false);
  });

  it('valid H.264 vertical MP4 passes probe+decode; corrupt bytes fail', async () => {
    if (!(await ffmpegAvailable())) return;
    const paths = resolveMediaToolPaths();
    const root = await mkdtemp(join(tmpdir(), 'asf-contract-'));
    const good = join(root, 'good.mp4');
    await synthesizeColorClip(paths, {
      outputPath: good,
      durationSeconds: 2,
      width: 720,
      height: 1280,
      fps: 30,
      color: '0x112233',
    });
    const probe = await probeMedia(paths, good);
    const result = validateProbeAgainstContract(probe, {
      ...DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT,
      minDurationSeconds: 1,
      maxDurationSeconds: 10,
    });
    expect(result.ok).toBe(true);
    expect((await assertDecodableVideo(paths, good)).ok).toBe(true);

    const bad = join(root, 'bad.mp4');
    await writeFile(bad, Buffer.from('not-an-mp4-file'));
    await expect(probeMedia(paths, bad)).rejects.toThrow();
  });
});
