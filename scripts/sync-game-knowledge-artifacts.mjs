#!/usr/bin/env node
/**
 * Milestone 7 — pull operator-provided research artifacts into draft KB patches.
 *
 * Never auto-publishes. Never calls Moonton APIs. Skips unchanged content.
 *
 * Usage:
 *   node scripts/sync-game-knowledge-artifacts.mjs --manifest assets/game-knowledge/sync-manifest.sample.json
 *   node scripts/sync-game-knowledge-artifacts.mjs --manifest path/to/manifest.json --force
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const knowledgeStore =
  process.env.ASF_GAME_KNOWLEDGE_PATH?.trim() || join(root, '.data', 'game-knowledge.json');
const syncStore =
  process.env.ASF_KB_SYNC_PATH?.trim() || join(root, '.data', 'kb-sync.json');

function parseArgs(argv) {
  const args = { manifest: null, force: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--manifest') args.manifest = argv[++i];
    else if (arg === '--force') args.force = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.manifest) {
    console.log(`Usage:
  node scripts/sync-game-knowledge-artifacts.mjs --manifest <manifest.json> [--force]

Spend flags (default OFF): MATCH_PAID_VISION_ENABLED, MATCH_TTS_SPEND_ENABLED
Remote artifact fetch is never performed by this script.
`);
    process.exit(args.help ? 0 : 1);
  }

  const db = await import(pathToFileURL(join(root, 'packages/database/dist/index.js')).href);
  const userId = process.env.ASF_GAME_KNOWLEDGE_USER_ID?.trim() || 'local-dev-user';

  const projects = new db.MemoryProjectRepository();
  const videos = new db.MemoryVideoRepository(projects);
  const knowledge = new db.MemoryGameKnowledgeRepository(projects, videos);
  const sync = new db.MemoryKbSyncRepository();

  try {
    const raw = JSON.parse(await readFile(knowledgeStore, 'utf8'));
    knowledge.importAll(raw.knowledge ?? raw);
  } catch {
    // fresh
  }
  try {
    sync.importAll({ ...(JSON.parse(await readFile(syncStore, 'utf8'))), userId });
  } catch {
    // fresh
  }

  const manifest = JSON.parse(await readFile(resolve(args.manifest), 'utf8'));
  const run = await db.pullKbArtifactsAsDrafts({
    userId,
    knowledge,
    sync,
    baseDir: root,
    manifest,
    forceReimportNoop: args.force,
  });

  await mkdir(dirname(knowledgeStore), { recursive: true });
  await writeFile(
    knowledgeStore,
    JSON.stringify(
      { version: 1, savedAt: new Date().toISOString(), knowledge: knowledge.exportAll() },
      null,
      2,
    ),
    'utf8',
  );
  await writeFile(syncStore, JSON.stringify(sync.exportAll(), null, 2), 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: run.failed_count === 0,
        run_id: run.id,
        auto_publish: run.auto_publish,
        imported_draft_count: run.imported_draft_count,
        skipped_unchanged_count: run.skipped_unchanged_count,
        failed_count: run.failed_count,
        results: run.results,
        note: 'Drafts only. Publish separately with PUBLISH_GAME_KNOWLEDGE.',
      },
      null,
      2,
    ),
  );
  process.exit(run.failed_count === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
