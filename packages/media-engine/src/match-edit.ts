import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import {
  buildSubtitlesFilter,
  renderSrt,
  type TimedCaptionCue,
} from './captions.js';
import {
  evaluateMatchEditQualityGates,
  type MatchEditQualityProfile,
} from './match-edit-quality.js';
import { assertMediaToolsAvailable, resolveMediaToolPaths, type MediaToolPaths } from './paths.js';
import { probeMedia } from './probe.js';
import type { QualityGateResult } from './quality.js';
import { runCommand } from './run-command.js';

export type MatchEditCutSegment = {
  /** Source timeline start (seconds). */
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  /** Playback speed (>1 speeds up boring gaps). */
  speed: number;
};

export type RenderMatchEditInput = {
  sourceVideoPath: string;
  segments: MatchEditCutSegment[];
  workDir: string;
  outputPath: string;
  profile: MatchEditQualityProfile;
  maxSeconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  burnCaptions?: boolean;
  captionCues?: TimedCaptionCue[];
  paths?: MediaToolPaths;
};

export type RenderMatchEditResult = {
  outputPath: string;
  durationSeconds: number;
  burnedCaptions: boolean;
  probe: Awaited<ReturnType<typeof probeMedia>>;
  quality: QualityGateResult;
};

function scalePadFilter(width: number, height: number, fps: number): string {
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps},format=yuv420p`;
}

async function extractCut(
  paths: MediaToolPaths,
  sourcePath: string,
  segment: MatchEditCutSegment,
  outPath: string,
  width: number,
  height: number,
  fps: number,
): Promise<void> {
  const duration = Math.max(0.05, segment.sourceEndSeconds - segment.sourceStartSeconds);
  const speed = Math.max(0.25, segment.speed);
  const vfParts = [scalePadFilter(width, height, fps)];
  if (Math.abs(speed - 1) > 0.001) {
    vfParts.push(`setpts=PTS/${speed}`);
  }
  // Video-only MVP: captions carry the story; TTS/audio mix is Milestone 7+.
  const args = [
    '-y',
    '-ss',
    String(segment.sourceStartSeconds),
    '-t',
    String(duration),
    '-i',
    sourcePath,
    '-vf',
    vfParts.join(','),
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outPath,
  ];
  const result = await runCommand(paths.ffmpeg, args, { timeoutMs: 120_000 });
  if (result.code !== 0) {
    throw new Error(
      `Failed to extract cut ${segment.sourceStartSeconds}-${segment.sourceEndSeconds}s: ${result.stderr}`,
    );
  }
}

async function concatClips(
  paths: MediaToolPaths,
  clipPaths: string[],
  listPath: string,
  concatPath: string,
): Promise<void> {
  const listBody = clipPaths.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join('\n');
  await writeFile(listPath, listBody, 'utf8');
  let result = await runCommand(paths.ffmpeg, [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-c',
    'copy',
    concatPath,
  ]);
  if (result.code !== 0) {
    result = await runCommand(paths.ffmpeg, [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      concatPath,
    ]);
  }
  if (result.code !== 0) {
    throw new Error(`Match edit concat failed: ${result.stderr}`);
  }
}

/**
 * Cut + speed-ramp source VOD segments into one vertical export with optional caption burn-in.
 */
export async function renderMatchEdit(input: RenderMatchEditInput): Promise<RenderMatchEditResult> {
  if (input.segments.length === 0) {
    throw new Error('At least one segment is required for match edit render');
  }

  const paths = input.paths ?? resolveMediaToolPaths();
  await assertMediaToolsAvailable(paths);

  const width = input.width ?? BUSINESS_DEFAULTS.finalVideoTargetWidth;
  const height = input.height ?? BUSINESS_DEFAULTS.finalVideoTargetHeight;
  const fps = input.fps ?? BUSINESS_DEFAULTS.finalVideoFps;
  const maxSeconds =
    input.maxSeconds ??
    (input.profile === 'short'
      ? BUSINESS_DEFAULTS.finalVideoMaxSeconds
      : 180);

  await mkdir(input.workDir, { recursive: true });
  await mkdir(dirname(input.outputPath), { recursive: true });

  const clipPaths: string[] = [];
  for (let i = 0; i < input.segments.length; i += 1) {
    const segment = input.segments[i]!;
    if (segment.sourceEndSeconds <= segment.sourceStartSeconds) {
      throw new Error(
        `Invalid segment bounds ${segment.sourceStartSeconds}-${segment.sourceEndSeconds}`,
      );
    }
    const outPath = join(input.workDir, `cut-${String(i).padStart(3, '0')}.mp4`);
    await extractCut(paths, input.sourceVideoPath, segment, outPath, width, height, fps);
    clipPaths.push(outPath);
  }

  const listPath = join(input.workDir, 'concat.txt');
  const concatPath = join(input.workDir, 'concat-raw.mp4');
  await concatClips(paths, clipPaths, listPath, concatPath);

  const cues = (input.captionCues ?? []).filter((c) => c.text.trim().length > 0);
  const burnedCaptions = Boolean(input.burnCaptions && cues.length > 0);

  let actuallyBurned = false;
  if (burnedCaptions) {
    const srtPath = join(input.workDir, 'captions.srt');
    await writeFile(srtPath, renderSrt(cues), 'utf8');
    const captioned = await runCommand(
      paths.ffmpeg,
      [
        '-y',
        '-i',
        concatPath,
        '-t',
        String(maxSeconds),
        '-vf',
        buildSubtitlesFilter(srtPath),
        '-an',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        input.outputPath,
      ],
      { timeoutMs: 180_000 },
    );
    if (captioned.code === 0) {
      actuallyBurned = true;
    } else {
      // Fall back to trim without captions when libass is unavailable.
      const fallback = await runCommand(
        paths.ffmpeg,
        [
          '-y',
          '-i',
          concatPath,
          '-t',
          String(maxSeconds),
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          input.outputPath,
        ],
        { timeoutMs: 120_000 },
      );
      if (fallback.code !== 0) {
        throw new Error(
          `Match edit caption burn-in failed and fallback export failed: ${captioned.stderr || fallback.stderr}`,
        );
      }
    }
  } else {
    const trimmed = await runCommand(
      paths.ffmpeg,
      [
        '-y',
        '-i',
        concatPath,
        '-t',
        String(maxSeconds),
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        input.outputPath,
      ],
      { timeoutMs: 120_000 },
    );
    if (trimmed.code !== 0) {
      const reencode = await runCommand(
        paths.ffmpeg,
        [
          '-y',
          '-i',
          concatPath,
          '-t',
          String(maxSeconds),
          '-an',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          input.outputPath,
        ],
        { timeoutMs: 120_000 },
      );
      if (reencode.code !== 0) {
        throw new Error(`Match edit final export failed: ${reencode.stderr}`);
      }
    }
  }

  const probe = await probeMedia(paths, input.outputPath);
  const quality = evaluateMatchEditQualityGates({
    probe,
    profile: input.profile,
    maxSeconds,
    targetWidth: width,
    targetHeight: height,
    targetFps: fps,
    upscaledFromLowerResolution: true,
  });

  if (!quality.ok) {
    throw new Error(`Match edit quality gates failed: ${quality.failures.join('; ')}`);
  }

  return {
    outputPath: input.outputPath,
    durationSeconds: probe.durationSeconds,
    burnedCaptions: actuallyBurned,
    probe,
    quality,
  };
}

/**
 * Map a source-timeline timestamp into the condensed edit timeline, accounting for speed-ups.
 * Returns null when the source time falls outside all segments.
 */
export function mapSourceTimeToEditTime(
  sourceSeconds: number,
  segments: MatchEditCutSegment[],
): number | null {
  let cursor = 0;
  for (const segment of segments) {
    const span = segment.sourceEndSeconds - segment.sourceStartSeconds;
    if (span <= 0) continue;
    const speed = Math.max(0.25, segment.speed);
    const outDuration = span / speed;
    if (
      sourceSeconds >= segment.sourceStartSeconds - 1e-6 &&
      sourceSeconds <= segment.sourceEndSeconds + 1e-6
    ) {
      const offset = Math.max(0, sourceSeconds - segment.sourceStartSeconds) / speed;
      return cursor + offset;
    }
    cursor += outDuration;
  }
  return null;
}
