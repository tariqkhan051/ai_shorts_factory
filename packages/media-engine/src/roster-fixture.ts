import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assertMediaToolsAvailable, resolveMediaToolPaths, type MediaToolPaths } from './paths.js';
import { runCommand } from './run-command.js';

export type RosterFixturePlayer = {
  playerTag: string;
  heroName: string;
};

export type SynthesizeRosterFixtureInput = {
  outputPath: string;
  players: RosterFixturePlayer[];
  durationSeconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  paths?: MediaToolPaths;
};

export type RosterFixtureManifest = {
  schema_version: 'match-roster-fixture-v1';
  players: RosterFixturePlayer[];
  expected_ocr_text: string;
};

/**
 * Build a synthetic loading-screen-like clip with burned-in roster text for OCR tests.
 * Uses FFmpeg drawtext only — not real MLBB footage.
 */
export async function synthesizeRosterFixtureVideo(
  input: SynthesizeRosterFixtureInput,
): Promise<RosterFixtureManifest> {
  const paths = input.paths ?? resolveMediaToolPaths();
  await assertMediaToolsAvailable(paths);
  await mkdir(dirname(input.outputPath), { recursive: true });

  const width = input.width ?? 720;
  const height = input.height ?? 1280;
  const fps = input.fps ?? 30;
  const durationSeconds = input.durationSeconds ?? 3;
  const lines = input.players.map((p) => `${p.playerTag} - ${p.heroName}`);
  const expected_ocr_text = ['LOADING ROSTER', ...lines].join('\n');

  // Escape drawtext special chars for FFmpeg.
  const escapeDrawtext = (value: string) =>
    value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");

  const drawFilters = [
    `drawtext=text='${escapeDrawtext('LOADING ROSTER')}':x=60:y=240:fontsize=36:fontcolor=white`,
    ...lines.map(
      (line, index) =>
        `drawtext=text='${escapeDrawtext(line)}':x=60:y=${320 + index * 70}:fontsize=32:fontcolor=white`,
    ),
  ];

  const result = await runCommand(paths.ffmpeg, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=0x1a1a2e:s=${width}x${height}:d=${durationSeconds}:r=${fps}`,
    '-vf',
    drawFilters.join(','),
    '-frames:v',
    String(Math.max(1, Math.floor(durationSeconds * fps))),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    input.outputPath,
  ]);

  if (result.code !== 0) {
    throw new Error(`Failed to synthesize roster fixture: ${result.stderr || result.stdout}`);
  }

  const manifest: RosterFixtureManifest = {
    schema_version: 'match-roster-fixture-v1',
    players: input.players,
    expected_ocr_text,
  };
  await writeFile(`${input.outputPath}.manifest.json`, JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

export function defaultRosterFixturePlayers(): RosterFixturePlayer[] {
  return [
    { playerTag: 'ShadowFox', heroName: 'Natalia' },
    { playerTag: 'IronWall', heroName: 'Tigreal' },
    { playerTag: 'PixelQueen', heroName: 'Natalia' },
  ];
}

export function rosterFixtureOutputPath(workDir: string): string {
  return join(workDir, 'roster-fixture.mp4');
}
