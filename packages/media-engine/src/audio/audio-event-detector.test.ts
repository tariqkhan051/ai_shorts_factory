import { describe, expect, it } from 'vitest';
import { createAudioEventDetector, StubAudioEventDetector } from './audio-event-detector.js';
import { HeuristicAudioEventDetector } from './heuristic-audio-event-detector.js';

describe('audio event detectors', () => {
  it('defaults to stub', () => {
    const detector = createAudioEventDetector({ MATCH_AUDIO_DETECTOR: 'stub' });
    expect(detector).toBeInstanceOf(StubAudioEventDetector);
    expect(detector.status).toBe('stub');
  });

  it('selects heuristic implementation when configured', () => {
    const detector = createAudioEventDetector({ MATCH_AUDIO_DETECTOR: 'heuristic' });
    expect(detector).toBeInstanceOf(HeuristicAudioEventDetector);
    expect(detector.status).toBe('ready');
    expect(detector.name).toContain('heuristic');
  });
});
