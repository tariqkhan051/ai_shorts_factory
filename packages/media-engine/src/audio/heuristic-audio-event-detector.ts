import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertMediaToolsAvailable, resolveMediaToolPaths } from '../paths.js';
import { runCommand } from '../run-command.js';
import type {
  AudioEventDetectionInput,
  AudioEventDetector,
  AudioEventHit,
} from './audio-event-types.js';

/**
 * Local-first heuristic detector.
 * Extracts mono audio, runs FFmpeg silencedetect inverted as a crude loudness spike finder,
 * and maps spikes to unknown announcement candidates — never claims perfect kill/objective labels.
 */
export class HeuristicAudioEventDetector implements AudioEventDetector {
  readonly name = 'heuristic-loudness-spikes';
  readonly status = 'ready' as const;

  async detect(input: AudioEventDetectionInput): Promise<AudioEventHit[]> {
    const paths = resolveMediaToolPaths(process.env);
    await assertMediaToolsAvailable(paths);
    await mkdir(input.workDir, { recursive: true });

    const wavPath = join(input.workDir, 'audio-mono.wav');
    const extract = await runCommand(
      paths.ffmpeg,
      [
        '-y',
        '-i',
        input.audioOrVideoPath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'pcm_s16le',
        wavPath,
      ],
      { timeoutMs: 600_000 },
    );
    if (extract.code !== 0) {
      throw new Error(`Audio extract failed: ${extract.stderr.slice(0, 400)}`);
    }

    // Use silencedetect noise floor; non-silence bursts ≈ announcement / VO spikes.
    const silence = await runCommand(
      paths.ffmpeg,
      ['-i', wavPath, '-af', 'silencedetect=noise=-30dB:d=0.25', '-f', 'null', '-'],
      { timeoutMs: 600_000 },
    );

    const log = `${silence.stderr}\n${silence.stdout}`;
    await writeFile(join(input.workDir, 'silencedetect.log'), log);

    const silenceEnds = [...log.matchAll(/silence_end:\s*([0-9.]+)/g)].map((m) =>
      Number(m[1]),
    );
    const hits: AudioEventHit[] = [];
    const dedupeWindow = 1.5;
    for (const ts of silenceEnds) {
      if (!Number.isFinite(ts) || ts < 0) continue;
      const last = hits[hits.length - 1];
      if (last && Math.abs(last.timestampSeconds - ts) < dedupeWindow) continue;
      hits.push({
        eventHint: 'unknown_announcement_candidate',
        timestampSeconds: ts,
        confidence: 0.35,
        evidenceRef: `silencedetect:${wavPath}#${ts.toFixed(2)}`,
        detector: this.name,
      });
    }

    // Cap volume of results for Free-tier artifact hygiene.
    return hits.slice(0, 200);
  }
}
