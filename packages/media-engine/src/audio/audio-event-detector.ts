import { HeuristicAudioEventDetector } from './heuristic-audio-event-detector.js';
import type {
  AudioEventDetectionInput,
  AudioEventDetector,
  AudioEventHit,
} from './audio-event-types.js';

export type {
  AudioEventHit,
  AudioEventDetectionInput,
  AudioEventDetectorStatus,
  AudioEventDetector,
} from './audio-event-types.js';

/**
 * Stub detector — does not invent kill/objective events.
 * Returns empty hits with explicit stub status for UI honesty.
 */
export class StubAudioEventDetector implements AudioEventDetector {
  readonly name = 'stub-audio-events';
  readonly status = 'stub' as const;

  async detect(_input: AudioEventDetectionInput): Promise<AudioEventHit[]> {
    return [];
  }
}

export function createAudioEventDetector(
  env: NodeJS.ProcessEnv = process.env,
): AudioEventDetector {
  const mode = env.MATCH_AUDIO_DETECTOR?.trim().toLowerCase() ?? 'stub';
  if (mode === 'stub' || mode === 'none') {
    return new StubAudioEventDetector();
  }
  if (mode === 'heuristic' || mode === 'local') {
    return new HeuristicAudioEventDetector();
  }
  return new StubAudioEventDetector();
}
