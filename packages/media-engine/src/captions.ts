export type SceneCaptionCue = {
  sceneNumber: number;
  text: string;
  durationSeconds: number;
};

export type TimedCaptionCue = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** Format seconds as SRT timestamp `HH:MM:SS,mmm`. */
export function formatSrtTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const millis = Math.min(999, Math.round((clamped - Math.floor(clamped)) * 1000));
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

/**
 * Build sequential timed cues from ordered scene captions.
 * Empty / whitespace-only captions are skipped (timeline still advances).
 */
export function buildTimedCaptionCues(scenes: SceneCaptionCue[]): TimedCaptionCue[] {
  const ordered = [...scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);
  const cues: TimedCaptionCue[] = [];
  let cursor = 0;
  for (const scene of ordered) {
    const duration = Math.max(0.1, scene.durationSeconds);
    const text = scene.text.trim();
    const start = cursor;
    const end = cursor + duration;
    if (text) {
      cues.push({ startSeconds: start, endSeconds: end, text });
    }
    cursor = end;
  }
  return cues;
}

export function renderSrt(cues: TimedCaptionCue[]): string {
  return cues
    .map((cue, index) => {
      const body = cue.text.replace(/\r\n/g, '\n').trim();
      return `${index + 1}\n${formatSrtTimestamp(cue.startSeconds)} --> ${formatSrtTimestamp(cue.endSeconds)}\n${body}\n`;
    })
    .join('\n');
}

/** Escape a filesystem path for FFmpeg `subtitles=` filter (Windows-safe). */
export function escapeSubtitlesFilterPath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

export const DEFAULT_CAPTION_FORCE_STYLE =
  "FontName=Arial,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=140";

export function buildSubtitlesFilter(srtPath: string, forceStyle = DEFAULT_CAPTION_FORCE_STYLE): string {
  const escaped = escapeSubtitlesFilterPath(srtPath);
  return `subtitles='${escaped}':force_style='${forceStyle}'`;
}
