#!/usr/bin/env node
/**
 * Long-running Autonomous Knowledge Engine scheduler.
 * Prefer this over Supabase free-tier background workers.
 *
 * Usage:
 *   node scripts/run-knowledge-engine-scheduler.mjs
 *   KNOWLEDGE_ENGINE_POLL_MS=300000 node scripts/run-knowledge-engine-scheduler.mjs
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
const pollMs = Number(process.env.KNOWLEDGE_ENGINE_POLL_MS ?? 300_000);

async function loadPkg(rel) {
  return import(pathToFileURL(join(root, rel)).href);
}

async function persist(knowledge, store) {
  await mkdir(dirname(kbPath), { recursive: true });
  await writeFile(
    kbPath,
    JSON.stringify({ version: 1, savedAt: new Date().toISOString(), knowledge: knowledge.exportAll() }, null, 2),
  );
  await writeFile(
    enginePath,
    JSON.stringify({ version: 1, savedAt: new Date().toISOString(), engine: store.exportSnapshot() }, null, 2),
  );
}

async function main() {
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

  const engine = new ke.AutonomousMlbbKnowledgeEngine({ store, knowledge });
  engine.activate(userId);

  console.info(
    JSON.stringify({
      service: 'knowledge-engine-scheduler',
      userId,
      pollMs,
      message: 'Scheduler started. Ctrl+C to stop.',
    }),
  );

  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });

  await ke.runKnowledgeEngineSchedulerLoop({
    engine,
    userId,
    pollIntervalMs: pollMs,
    lockOwner: `kb-scheduler:${process.pid}`,
    shouldStop: () => stopping,
    onTick: async ({ ran }) => {
      console.info(JSON.stringify({ service: 'knowledge-engine-scheduler', ran, at: new Date().toISOString() }));
      await persist(knowledge, store);
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
