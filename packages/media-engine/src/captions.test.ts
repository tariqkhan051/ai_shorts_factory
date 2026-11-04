import { describe, expect, it } from 'vitest';
import {
  buildSubtitlesFilter,
  buildTimedCaptionCues,
  escapeSubtitlesFilterPath,
  formatSrtTimestamp,
  renderSrt,
} from './captions.js';

describe('captions', () => {
  it('formats SRT timestamps', () => {
    expect(formatSrtTimestamp(0)).toBe('00:00:00,000');
    expect(formatSrtTimestamp(6)).toBe('00:00:06,000');
    expect(formatSrtTimestamp(65.5)).toBe('00:01:05,500');
  });

  it('builds timed cues and skips empty captions while advancing timeline', () => {
    const cues = buildTimedCaptionCues([
      { sceneNumber: 1, text: 'It knows your name', durationSeconds: 6 },
      { sceneNumber: 2, text: '  ', durationSeconds: 6 },
      { sceneNumber: 3, text: 'Open it', durationSeconds: 8 },
    ]);
    expect(cues).toEqual([
      { startSeconds: 0, endSeconds: 6, text: 'It knows your name' },
      { startSeconds: 12, endSeconds: 20, text: 'Open it' },
    ]);
  });

  it('renders SRT and escapes Windows subtitle paths', () => {
    const srt = renderSrt([
      { startSeconds: 0, endSeconds: 6, text: 'Hello' },
      { startSeconds: 6, endSeconds: 12, text: 'World' },
    ]);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:06,000\nHello');
    expect(srt).toContain('2\n00:00:06,000 --> 00:00:12,000\nWorld');

    expect(escapeSubtitlesFilterPath('D:\\tmp\\captions.srt')).toBe('D\\:/tmp/captions.srt');
    expect(buildSubtitlesFilter('D:\\tmp\\captions.srt')).toContain("subtitles='D\\:/tmp/captions.srt'");
  });
});
