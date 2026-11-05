#!/usr/bin/env node
/**
 * Milestone 3 — ingest a local match video and run roster OCR analysis (local OCR only).
 *
 * Usage:
 *   node scripts/analyze-match-roster.mjs --video path/to/match.mp4 --patch-id <uuid> --env original --ocr-text-file roster.txt
 *   node scripts/analyze-match-roster.mjs --video path/to/match.mp4 --patch-id <uuid> --env original --prefer-tesseract
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const knowledgeStore =
  process.env.ASF_GAME_KNOWLEDGE_PATH?.trim() || join(root, '.data', 'game-knowledge.json');
const analysisStore =
  process.env.ASF_MATCH_ANALYSIS_PATH?.trim() || join(root, '.data', 'match-analysis.json');

function parseArgs(argv) {
  const args = {
    video: null,
    patchId: null,
    env: 'original',
    title: 'Match VOD',
    ocrTextFile: null,
    preferTesseract: false,
    force: false,
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
  }
  return args;
}

async function loadModules() {
  const db = await import(pathToFileURL(join(root, 'packages/database/dist/index.js')).href);
  const media = await import(pathToFileURL(join(root, 'packages/media-engine/dist/index.js')).href);
  return { db, media };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.video || !args.patchId) {
    console.error(
      'Required: --video <path> --patch-id <uuid> [--env original|advance] [--ocr-text-file txt] [--prefer-tesseract]',
    );
    process.exit(1);
  }

  const { db, media } = await loadModules();
  const projects = new db.MemoryProjectRepository();
  const videos = new db.MemoryVideoRepository(projects);
  const knowledge = new db.MemoryGameKnowledgeRepository(projects, videos);
  const analysis = new db.MemoryMatchAnalysisRepository();

  try {
    const raw = await readFile(knowledgeStore, 'utf8');
    knowledge.importAll(JSON.parse(raw).knowledge ?? {});
  } catch {
    console.error(`Game knowledge store not found at ${knowledgeStore}. Import/publish a patch first.`);
    process.exit(1);
  }
  try {
    const raw = await readFile(analysisStore, 'utf8');
    analysis.importAll(JSON.parse(raw));
  } catch {
    // fresh
  }

  const userId = process.env.ASF_GAME_KNOWLEDGE_USER_ID?.trim() || 'local-dev-user';
  let ocr;
  if (args.ocrTextFile) {
    const text = await readFile(resolve(args.ocrTextFile), 'utf8');
    ocr = new media.ScriptedOcrProvider({ '*': { text, confidence: 0.9 } });
  } else if (args.preferTesseract) {
    ocr = await media.createOcrProvider({ prefer: 'tesseract' });
  } else {
    ocr = await media.createOcrProvider({ prefer: 'scripted' });
    console.warn(
      'Using empty scripted OCR. Pass --ocr-text-file or --prefer-tesseract for real text extraction.',
    );
  }

  const source = await db.ingestMatchVideo(analysis, knowledge, userId, {
    title: args.title,
    local_path: resolve(args.video),
    server_environment: args.env,
    game_patch_id: args.patchId,
  });

  const workDir = join(root, '.data', 'match-work');
  await mkdir(workDir, { recursive: true });
  const job = await db.analyzeMatchRoster(
    userId,
    source.id,
    { knowledge, analysis, ocr, workDir },
    { force: args.force },
  );

  await mkdir(dirname(analysisStore), { recursive: true });
  await writeFile(analysisStore, JSON.stringify(analysis.exportAll(), null, 2), 'utf8');

  console.log(
    JSON.stringify(
      {
        match_source_id: source.id,
        job_id: job.id,
        status: job.status,
        error_message: job.error_message,
        result: job.result,
        note: 'No paid vision APIs were used.',
      },
      null,
      2,
    ),
  );
  if (job.status === 'failed') process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
