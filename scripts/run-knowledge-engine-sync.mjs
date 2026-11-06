#!/usr/bin/env node
/**
 * One-shot Autonomous Knowledge Engine sync (manual admin action / cron wrapper).
 *
 * Usage:
 *   node scripts/run-knowledge-engine-sync.mjs
 *   node scripts/run-knowledge-engine-sync.mjs --kind patch_monitor
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kbPath =
  process.env.ASF_GAME_KNOWLEDGE_PATH?.trim() || join(root, '.data', 'game-knowledge.json');
const enginePath =
  process.env.ASF_KNOWLEDGE_ENGINE_PATH?.trim() || join(root, '.data', 'knowledge-engine.json');
const userId = process.env.ASF_KB_USER_ID?.trim() || 'local-dev-user';

async function loadPkg(rel) {
  return import(pathToFileURL(join(root, rel)).href);
}

async function main() {
  const kindArgIdx = process.argv.indexOf('--kind');
  const kind = kindArgIdx >= 0 ? process.argv[kindArgIdx + 1] : 'manual_sync';

  const db = await loadPkg('packages/database/dist/index.js');
  const ke = await loadPkg('packages/knowledge-engine/dist/index.js');

  const projects = new db.MemoryProjectRepository();
  const videos = new db.MemoryVideoRepository(projects);
  const knowledge = new db.MemoryGameKnowledgeRepository(projects, videos);
  try {
    knowledge.importAll(JSON.parse(await readFile(kbPath, 'utf8')).knowledge);
  } catch {
    /* fresh */
  }
  const store = new ke.MemoryKnowledgeEngineStore();
  try {
    const snap = JSON.parse(await readFile(enginePath, 'utf8'));
    if (snap.engine) store.importSnapshot(snap.engine);
  } catch {
    /* fresh */
  }

  const engine = new ke.AutonomousMlbbKnowledgeEngine({
    store,
    knowledge,
    heroLimit: Number(process.env.KNOWLEDGE_ENGINE_HERO_LIMIT ?? 60),
    itemLimit: Number(process.env.KNOWLEDGE_ENGINE_ITEM_LIMIT ?? 60),
  });
  engine.activate(userId);
  const result = await engine.syncNow(userId, kind);

  await mkdir(dirname(kbPath), { recursive: true });
  await writeFile(
    kbPath,
    JSON.stringify({ version: 1, savedAt: new Date().toISOString(), knowledge: knowledge.exportAll() }, null, 2),
  );
  await writeFile(
    enginePath,
    JSON.stringify({ version: 1, savedAt: new Date().toISOString(), engine: store.exportSnapshot() }, null, 2),
  );

  console.log(JSON.stringify({ ok: result.status === 'succeeded', result }, null, 2));
  if (result.status !== 'succeeded') process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
