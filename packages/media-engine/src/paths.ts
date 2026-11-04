import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

export type MediaToolPaths = {
  ffmpeg: string;
  ffprobe: string;
};

export function resolveMediaToolPaths(env: NodeJS.ProcessEnv = process.env): MediaToolPaths {
  return {
    ffmpeg: env.FFMPEG_PATH || env.FFMPEG || 'ffmpeg',
    ffprobe: env.FFPROBE_PATH || env.FFPROBE || 'ffprobe',
  };
}

export async function assertMediaToolsAvailable(paths: MediaToolPaths): Promise<void> {
  for (const [label, binary] of [
    ['ffmpeg', paths.ffmpeg],
    ['ffprobe', paths.ffprobe],
  ] as const) {
    if (binary.includes('/') || binary.includes('\\') || binary.endsWith('.exe')) {
      try {
        await access(binary, constants.X_OK);
      } catch {
        // On Windows X_OK may fail; fall through to spawn-time errors for PATH binaries.
        try {
          await access(binary, constants.F_OK);
        } catch {
          throw new Error(`${label} not found at ${binary}`);
        }
      }
    }
  }
}
