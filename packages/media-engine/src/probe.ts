import { runCommand } from './run-command.js';
import type { MediaToolPaths } from './paths.js';

export type MediaProbe = {
  path: string;
  durationSeconds: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  formatName: string | null;
  raw: unknown;
};

function parseFps(rate: string | undefined): number | null {
  if (!rate || rate === '0/0') return null;
  const parts = rate.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return num / den;
    }
  }
  const asNumber = Number(rate);
  return Number.isFinite(asNumber) ? asNumber : null;
}

export async function probeMedia(paths: MediaToolPaths, filePath: string): Promise<MediaProbe> {
  const result = await runCommand(paths.ffprobe, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);

  if (result.code !== 0) {
    throw new Error(`ffprobe failed for ${filePath}: ${result.stderr || result.stdout}`);
  }

  const raw = JSON.parse(result.stdout) as {
    format?: { duration?: string; format_name?: string };
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      r_frame_rate?: string;
    }>;
  };

  const video = raw.streams?.find((stream) => stream.codec_type === 'video');
  const audio = raw.streams?.find((stream) => stream.codec_type === 'audio');
  const durationSeconds = Number.parseFloat(raw.format?.duration ?? '0');

  return {
    path: filePath,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    width: video?.width ?? null,
    height: video?.height ?? null,
    fps: parseFps(video?.avg_frame_rate) ?? parseFps(video?.r_frame_rate),
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    formatName: raw.format?.format_name ?? null,
    raw,
  };
}

export async function isReadableVideo(paths: MediaToolPaths, filePath: string): Promise<boolean> {
  try {
    const probe = await probeMedia(paths, filePath);
    return probe.hasVideo && probe.durationSeconds > 0;
  } catch {
    return false;
  }
}
