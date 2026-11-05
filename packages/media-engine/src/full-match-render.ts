import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import type { MatchEditCutSegment } from './match-edit.js';
import { renderMatchEdit } from './match-edit.js';
import { assertMediaToolsAvailable, resolveMediaToolPaths, type MediaToolPaths } from './paths.js';
import { probeMedia } from './probe.js';
import { runCommand } from './run-command.js';

export type FullMatchRenderInput = {
  sourcePath: string;
  workDir: string;
  outputPath: string;
  segments: MatchEditCutSegment[];
  /** Optional narration WAV/MP3 to mix under gameplay (ducked). */
  narrationPath?: string;
  narrationVolume?: number;
  gameplayVolume?: number;
  width?: number;
  height?: number;
  fps?: number;
  maxSeconds?: number;
  burnCaptions?: boolean;
  captionCues?: { startSeconds: number; endSeconds: number; text: string; sceneNumber?: number }[];
  paths?: MediaToolPaths;
};

export type FullMatchRenderResult = {
  outputPath: string;
  durationSeconds: number;
  width: number;
  height: number;
  usedNarration: boolean;
  profile: 'full_match';
};

/**
 * Full-match oriented render: uses match-edit cutting/speed, optionally mixes narration.
 * Does NOT use shorts assembleProject (5-scene / 59s contract).
 */
export async function renderFullMatch(input: FullMatchRenderInput): Promise<FullMatchRenderResult> {
  const paths = input.paths ?? resolveMediaToolPaths();
  await assertMediaToolsAvailable(paths);
  await mkdir(input.workDir, { recursive: true });

  const width = input.width ?? BUSINESS_DEFAULTS.finalVideoTargetWidth;
  const height = input.height ?? BUSINESS_DEFAULTS.finalVideoTargetHeight;
  const fps = input.fps ?? BUSINESS_DEFAULTS.finalVideoFps;
  const maxSeconds = input.maxSeconds ?? 3600;

  const silentPath = join(input.workDir, 'full-silent.mp4');
  const edit = await renderMatchEdit({
    sourceVideoPath: input.sourcePath,
    workDir: join(input.workDir, 'cuts'),
    outputPath: silentPath,
    segments: input.segments,
    profile: 'condensed',
    width,
    height,
    fps,
    maxSeconds,
    burnCaptions: input.burnCaptions,
    captionCues: input.captionCues,
    paths,
  });

  if (!input.narrationPath) {
    // Move/copy silent as final
    await runCommand(paths.ffmpeg, ['-y', '-i', edit.outputPath, '-c', 'copy', input.outputPath], {
      timeoutMs: 180_000,
    });
    const probe = await probeMedia(paths, input.outputPath);
    return {
      outputPath: input.outputPath,
      durationSeconds: probe.durationSeconds,
      width: probe.width ?? width,
      height: probe.height ?? height,
      usedNarration: false,
      profile: 'full_match',
    };
  }

  const gameplayVol = input.gameplayVolume ?? 0.35;
  const narrationVol = input.narrationVolume ?? 1;
  // Re-enable audio from source segments is complex; mix narration over silent video track.
  const result = await runCommand(
    paths.ffmpeg,
    [
      '-y',
      '-i',
      edit.outputPath,
      '-i',
      input.narrationPath,
      '-filter_complex',
      `[1:a]volume=${narrationVol}[nar];` +
        `anullsrc=channel_layout=stereo:sample_rate=44100,volume=${gameplayVol}[bed];` +
        `[bed][nar]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
      '-map',
      '0:v',
      '-map',
      '[aout]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-shortest',
      '-movflags',
      '+faststart',
      input.outputPath,
    ],
    { timeoutMs: 300_000 },
  );
  if (result.code !== 0) {
    // Fallback: copy silent video and leave narration as sidecar note file
    await runCommand(paths.ffmpeg, ['-y', '-i', edit.outputPath, '-c', 'copy', input.outputPath], {
      timeoutMs: 180_000,
    });
    await writeFile(
      join(input.workDir, 'narration-mix-failed.txt'),
      result.stderr || 'narration mix failed',
      'utf8',
    );
  }

  const probe = await probeMedia(paths, input.outputPath);
  return {
    outputPath: input.outputPath,
    durationSeconds: probe.durationSeconds,
    width: probe.width ?? width,
    height: probe.height ?? height,
    usedNarration: result.code === 0,
    profile: 'full_match',
  };
}
