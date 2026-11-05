#!/usr/bin/env node
/**
 * Milestone 4 — build/correct/export a match event timeline (local OCR only).
 *
 * Usage:
 *   node scripts/analyze-match-timeline.mjs --video match.mp4 --patch-id <uuid> --env original --ocr-text-file feed.txt
 *   node scripts/analyze-match-timeline.mjs --export-timeline <timelineId>
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const knowledgeStore =
  process.env.ASF_GAME_KNOWLEDGE_PATH?.trim() || join(root, '.data', 'game-knowledge.json');
const analysisStore =
  process.env.ASF_MATCH_ANALYSIS_PATH?.trim() || join(root, '.data', 'match-analysis.json');
const timelineStore =
  process.env.ASF_MATCH_TIMELINE_PATH?.trim() || join(root, '.data', 'match-timelines.json');

function parseArgs(argv) {
  const args = {
    video: null,
    patchId: null,
    env: 'original',
    title: 'Match VOD',
    ocrTextFile: null,
    preferTesseract: false,
    force: false,
    exportTimeline: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--video') args.video = argv[++i];
    else if (arg === '--patch-id') args.patchId = argv[++i];
    else if (arg === '--env') args.env = argv[++i];
    else if (arg === '--title') args.title = argv[++i];
    else if (arg === '--ocr-text-file') args.ocrTextFile = argv[++i];
    else if (arg === '--prefer-tesseract') args.preferTesseract = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--export-timeline') args.exportTimeline = argv[++i];
  }
  return args;
}

async function loadModules() {
  const db = await import(pathToFileURL(join(root, 'packages/database/dist/index.js')).href);
  const media = await import(pathToFileURL(join(root, 'packages/media-engine/dist/index.js')).href);
  return { db, media };
}

async function persist(analysis, timelines) {
  await mkdir(dirname(analysisStore), { recursive: true });
  await writeFile(analysisStore, JSON.stringify(analysis.exportAll(), null, 2), 'utf8');
  await writeFile(timelineStore, JSON.stringify(timelines.exportAll(), null, 2), 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { db, media } = await loadModules();
  const projects = new db.MemoryProjectRepository();
  const videos = new db.MemoryVideoRepository(projects);
  const knowledge = new db.MemoryGameKnowledgeRepository(projects, videos);
  const analysis = new db.MemoryMatchAnalysisRepository();
  const timelines = new db.MemoryMatchTimelineRepository();
  const userId = process.env.ASF_GAME_KNOWLEDGE_USER_ID?.trim() || 'local-dev-user';

  try {
    knowledge.importAll(JSON.parse(await readFile(knowledgeStore, 'utf8')).knowledge ?? {});
  } catch {
    console.error(`Missing game knowledge store at ${knowledgeStore}`);
    process.exit(1);
  }
  try {
    analysis.importAll(JSON.parse(await readFile(analysisStore, 'utf8')));
  } catch {
    // fresh
  }
  try {
    timelines.importAll(JSON.parse(await readFile(timelineStore, 'utf8')));
  } catch {
    // fresh
  }

  if (args.exportTimeline) {
    const exported = await timelines.exportTimeline(userId, args.exportTimeline);
    const outPath = join(root, '.data', `timeline-${args.exportTimeline}.json`);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(exported, null, 2), 'utf8');
    console.log(JSON.stringify({ exported: true, path: outPath, event_count: exported.events.length }, null, 2));
    return;
  }

  if (!args.video || !args.patchId) {
    console.error(
      'Required: --video <path> --patch-id <uuid> [--ocr-text-file feed.txt] | --export-timeline <id>',
    );
    process.exit(1);
  }

  let ocr;
  if (args.ocrTextFile) {
    ocr = new media.ScriptedOcrProvider({
      '*': { text: await readFile(resolve(args.ocrTextFile), 'utf8'), confidence: 0.9 },
    });
  } else if (args.preferTesseract) {
    ocr = await media.createOcrProvider({ prefer: 'tesseract' });
  } else {
    ocr = await media.createOcrProvider({ prefer: 'scripted' });
    console.warn('Empty scripted OCR in use. Pass --ocr-text-file for deterministic detection.');
  }

  const source = await db.ingestMatchVideo(analysis, knowledge, userId, {
    title: args.title,
    local_path: resolve(args.video),
    server_environment: args.env,
    game_patch_id: args.patchId,
  });

  const workDir = join(root, '.data', 'match-work');
  await mkdir(workDir, { recursive: true });
  const timeline = await db.analyzeMatchEventTimeline(
    userId,
    source.id,
    { knowledge, analysis, timelines, ocr, workDir },
    { force: args.force },
  );
  await persist(analysis, timelines);

  console.log(
    JSON.stringify(
      {
        match_source_id: source.id,
        timeline_id: timeline.id,
        status: timeline.status,
        event_count: timeline.events.length,
        events: timeline.events.map((event) => ({
          id: event.id,
          type: event.event_type,
          t: event.timestamp_seconds,
          confidence: event.confidence,
          windows: event.windows,
          participants: event.participants,
        })),
        export_hint: `node scripts/analyze-match-timeline.mjs --export-timeline ${timeline.id}`,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
