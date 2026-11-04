import { getPackageMeta } from '@ai-shorts-factory/media-engine';
import { BUSINESS_DEFAULTS, PHASE } from '@ai-shorts-factory/shared-types';

/**
 * Media worker entrypoint (Phase 0 scaffold).
 * FFmpeg assembly pipeline lands in Phase 5.
 */
async function main(): Promise<void> {
  const enabled = process.env.MEDIA_WORKER_ENABLED === 'true';
  const ffmpegPath = process.env.FFMPEG_PATH || process.env.FFMPEG || 'ffmpeg';
  const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';

  console.info(
    JSON.stringify({
      service: 'media-worker',
      phase: PHASE.current,
      enabled,
      mediaEngine: getPackageMeta(),
      tools: { ffmpegPath, ffprobePath },
      defaults: {
        maxSeconds: BUSINESS_DEFAULTS.finalVideoMaxSeconds,
        width: BUSINESS_DEFAULTS.finalVideoTargetWidth,
        height: BUSINESS_DEFAULTS.finalVideoTargetHeight,
        fps: BUSINESS_DEFAULTS.finalVideoFps,
      },
      message: enabled
        ? 'Worker enabled flag set; assembly loop not implemented until Phase 5.'
        : 'MEDIA_WORKER_ENABLED is false. Exiting without claiming jobs.',
    }),
  );
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      service: 'media-worker',
      level: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }),
  );
  process.exitCode = 1;
});
