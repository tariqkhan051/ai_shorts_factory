#!/usr/bin/env node
/**
 * Bootstrap / initial ingestion for the Autonomous MLBB Knowledge Engine.
 * Discovers community (Fandom) + official homepage sources and imports draft Game KB.
 * Does not publish. Does not require portal manual entry.
 *
 * Usage:
 *   node scripts/bootstrap-knowledge-engine.mjs
 *   node scripts/bootstrap-knowledge-engine.mjs --hero-limit 20 --item-limit 20
 *   node scripts/bootstrap-knowledge-engine.mjs --offline-fixture  (uses bundled sample HTML)
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

function parseArgs(argv) {
  const args = { heroLimit: 30, itemLimit: 30, offlineFixture: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--hero-limit') args.heroLimit = Number(argv[++i] ?? 30);
    else if (arg === '--item-limit') args.itemLimit = Number(argv[++i] ?? 30);
    else if (arg === '--offline-fixture') args.offlineFixture = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

async function loadPkg(rel) {
  return import(pathToFileURL(join(root, rel)).href);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node scripts/bootstrap-knowledge-engine.mjs [--hero-limit N] [--item-limit N] [--offline-fixture]
`);
    return;
  }

  const db = await loadPkg('packages/database/dist/index.js');
  const ke = await loadPkg('packages/knowledge-engine/dist/index.js');

  const projects = new db.MemoryProjectRepository();
  const videos = new db.MemoryVideoRepository(projects);
  const knowledge = new db.MemoryGameKnowledgeRepository(projects, videos);
  try {
    const raw = await readFile(kbPath, 'utf8');
    knowledge.importAll(JSON.parse(raw).knowledge ?? JSON.parse(raw));
  } catch {
    // fresh
  }

  const store = new ke.MemoryKnowledgeEngineStore();
  try {
    const raw = await readFile(enginePath, 'utf8');
    const snap = JSON.parse(raw);
    if (snap.engine) store.importSnapshot(snap.engine);
  } catch {
    // fresh
  }

  const offlineFixtures = args.offlineFixture
    ? {
        heroes: [
          {
            title: 'Natalia',
            url: 'https://mobile-legends.fandom.com/wiki/Natalia',
            html: `<div data-source="name"><div class="pi-data-value">Natalia</div></div>
<div data-source="role"><div class="pi-data-value">Assassin</div></div>
<div data-source="lane"><div class="pi-data-value">Jungle</div></div>
<h2 id="Passive">Passive</h2><p>Assassin Instinct</p>
<h2 id="Skill_1">Skill 1</h2><p>Smoke Bomb</p>
<h2 id="Skill_2">Skill 2</h2><p>Ghost Blade</p>
<h2 id="Ultimate">Ultimate</h2><p>The Hunt</p>`,
          },
        ],
        patchHtml: [
          {
            title: 'Patch 1.9.50 Original Server',
            url: 'https://example.test/patch',
            serverType: 'original',
            html: '<p>Natalia buffed. New hero sample. Turtle spawn adjusted.</p>',
          },
        ],
      }
    : undefined;

  const engine = new ke.AutonomousMlbbKnowledgeEngine({
    store,
    knowledge,
    heroLimit: args.heroLimit,
    itemLimit: args.itemLimit,
    offlineFixtures,
  });

  engine.activate(userId);
  const results = [];
  results.push(await engine.syncNow(userId, 'initial_ingestion'));
  results.push(await engine.syncNow(userId, 'patch_monitor'));

  await mkdir(dirname(kbPath), { recursive: true });
  await writeFile(
    kbPath,
    JSON.stringify({ version: 1, savedAt: new Date().toISOString(), knowledge: knowledge.exportAll() }, null, 2),
  );
  await writeFile(
    enginePath,
    JSON.stringify({ version: 1, savedAt: new Date().toISOString(), engine: store.exportSnapshot() }, null, 2),
  );

  const dash = engine.getDashboard(userId);
  const profiles = await knowledge.listProfiles(userId);
  let heroCount = 0;
  let patchCount = 0;
  for (const profile of profiles) {
    const patches = await knowledge.listPatches(userId, profile.id);
    patchCount += patches.length;
    for (const patch of patches) {
      heroCount += (await knowledge.listHeroes(userId, patch.id)).length;
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: results.every((r) => r.status === 'succeeded' || r.duplicates_skipped > 0),
        userId,
        results,
        counts: {
          heroes_in_kb: heroCount,
          items: dash.stats.items,
          patches_ext: dash.stats.patches,
          game_patches: patchCount,
          sources: dash.sources.length,
        },
        limitations: results.flatMap((r) => r.limitations),
        paths: { kbPath, enginePath },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
