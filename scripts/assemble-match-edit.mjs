#!/usr/bin/env node
/**
 * Milestone 6 — event-based condensed edit + 1–2 Shorts from a verified timeline.
 *
 * Usage:
 *   node scripts/assemble-match-edit.mjs --timeline-id <uuid> --video path/to/match.mp4
 *   node scripts/assemble-match-edit.mjs --approve-edit <editId> --confirm APPROVE_MATCH_DISTRIBUTION
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const timelineStore =
  process.env.ASF_MATCH_TIMELINE_PATH?.trim() || join(root, '.data', 'match-timelines.json');
const editStore =
  process.env.ASF_MATCH_EDIT_PATH?.trim() || join(root, '.data', 'match-edits.json');

function parseArgs(argv) {
  const args = {
    timelineId: null,
    video: null,
    commentaryFile: null,
    burnCaptions: true,
    outDir: null,
    approveEdit: null,
    confirm: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--timeline-id') args.timelineId = argv[++i];
    else if (arg === '--video') args.video = argv[++i];
    else if (arg === '--commentary-file') args.commentaryFile = argv[++i];
    else if (arg === '--no-captions') args.burnCaptions = false;
    else if (arg === '--out-dir') args.outDir = argv[++i];
    else if (arg === '--approve-edit') args.approveEdit = argv[++i];
    else if (arg === '--confirm') args.confirm = argv[++i];
  }
  return args;
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = await import(pathToFileURL(join(root, 'packages/database/dist/index.js')).href);
  const userId = process.env.ASF_GAME_KNOWLEDGE_USER_ID?.trim() || 'local-dev-user';

  const timelines = new db.MemoryMatchTimelineRepository();
  const edits = new db.MemoryMatchEditRepository();

  try {
    timelines.importAll(await loadJson(timelineStore));
  } catch {
    if (!args.approveEdit) {
      console.error(`Missing timeline store: ${timelineStore}`);
      process.exit(1);
    }
  }

  try {
    edits.importAll(await loadJson(editStore));
  } catch {
    // optional on first run
  }

  if (args.approveEdit) {
    const result = await db.approveMatchEditForDistribution({
      userId,
      editId: args.approveEdit,
      confirmationPhrase: args.confirm ?? '',
      edits,
    });
    await mkdir(dirname(editStore), { recursive: true });
    await writeFile(editStore, JSON.stringify(edits.exportAll(), null, 2), 'utf8');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (!args.timelineId || !args.video) {
    console.error(
      'Required: --timeline-id <uuid> --video path/to/match.mp4 [--commentary-file file.json]',
    );
    process.exit(1);
  }

  let commentary = null;
  if (args.commentaryFile) {
    commentary = await loadJson(resolve(args.commentaryFile));
  }

  const outDir = args.outDir || join(root, '.data', 'match-edits', args.timelineId);
  const workDir = join(outDir, 'work');
  await mkdir(outDir, { recursive: true });

  const result = await db.assembleMatchEditFromTimeline({
    userId,
    timelineId: args.timelineId,
    sourceVideoPath: resolve(args.video),
    workDir,
    outputDir: outDir,
    timelines,
    edits,
    commentary,
    burnCaptions: args.burnCaptions,
  });

  await mkdir(dirname(editStore), { recursive: true });
  await writeFile(editStore, JSON.stringify(edits.exportAll(), null, 2), 'utf8');

  const exportPath = join(outDir, `edit-export-${result.edit.id}.json`);
  await writeFile(exportPath, JSON.stringify(edits.toExport(result.edit), null, 2), 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        edit_id: result.edit.id,
        plan_id: result.plan.id,
        status: result.edit.status,
        artifacts: result.artifacts.map((a) => ({
          kind: a.kind,
          short_rank: a.short_rank,
          path: a.path,
          duration_seconds: a.duration_seconds,
          quality_ok: a.quality_ok,
        })),
        export_path: exportPath,
        note: `Human approval required before distribution: pnpm match:edit -- --approve-edit ${result.edit.id} --confirm APPROVE_MATCH_DISTRIBUTION`,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
