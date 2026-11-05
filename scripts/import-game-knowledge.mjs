#!/usr/bin/env node
/**
 * Milestone 2 — import MLBB / game patch research JSON as a draft knowledge patch.
 *
 * Never auto-publishes. Publishing requires --publish-patch <id> --i-confirm-publish.
 *
 * Usage:
 *   node scripts/import-game-knowledge.mjs --file assets/game-knowledge/mlbb-original-1.9.42.sample.json --dry-run
 *   node scripts/import-game-knowledge.mjs --file assets/game-knowledge/mlbb-original-1.9.42.sample.json --apply-draft
 *   node scripts/import-game-knowledge.mjs --publish-patch <uuid> --i-confirm-publish
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const storePath =
  process.env.ASF_GAME_KNOWLEDGE_PATH?.trim() || join(root, '.data', 'game-knowledge.json');

function usage() {
  console.log(`Usage:
  node scripts/import-game-knowledge.mjs --file <path.json> --dry-run
  node scripts/import-game-knowledge.mjs --file <path.json> --apply-draft
  node scripts/import-game-knowledge.mjs --publish-patch <patchId> --i-confirm-publish
`);
}

function parseArgs(argv) {
  const args = {
    file: null,
    dryRun: false,
    applyDraft: false,
    publishPatch: null,
    confirmPublish: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') args.file = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--apply-draft') args.applyDraft = true;
    else if (arg === '--publish-patch') args.publishPatch = argv[++i];
    else if (arg === '--i-confirm-publish') args.confirmPublish = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

async function loadDb() {
  const dbUrl = pathToFileURL(join(root, 'packages/database/dist/index.js')).href;
  return import(dbUrl);
}

async function loadStore(db) {
  const projects = new db.MemoryProjectRepository();
  const videos = new db.MemoryVideoRepository(projects);
  const knowledge = new db.MemoryGameKnowledgeRepository(projects, videos);
  try {
    const raw = await readFile(storePath, 'utf8');
    const snapshot = JSON.parse(raw);
    knowledge.importAll(snapshot.knowledge ?? snapshot);
  } catch {
    // fresh store
  }
  return { projects, videos, knowledge };
}

async function saveStore(knowledge) {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(
    storePath,
    JSON.stringify(
      {
        version: 1,
        savedAt: new Date().toISOString(),
        knowledge: knowledge.exportAll(),
      },
      null,
      2,
    ),
    'utf8',
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.file && !args.publishPatch)) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const db = await loadDb();
  const { knowledge } = await loadStore(db);
  const userId = process.env.ASF_GAME_KNOWLEDGE_USER_ID?.trim() || 'local-dev-user';

  if (args.publishPatch) {
    if (!args.confirmPublish) {
      console.error('Refusing to publish without --i-confirm-publish');
      process.exit(1);
    }
    const published = await db.publishGameKnowledgeWithConfirmation(
      knowledge,
      userId,
      args.publishPatch,
      db.PUBLISH_GAME_KNOWLEDGE_PHRASE,
    );
    await saveStore(knowledge);
    console.log(
      JSON.stringify(
        {
          published: true,
          patch_id: published.id,
          patch_code: published.patch_code,
          server_environment: published.server_environment,
          status: published.status,
        },
        null,
        2,
      ),
    );
    return;
  }

  const filePath = resolve(args.file);
  const raw = await readFile(filePath, 'utf8');

  if (args.dryRun || !args.applyDraft) {
    const preview = await db.previewGameKnowledgeImport(knowledge, userId, raw);
    if (!preview.ok) {
      console.error(JSON.stringify(preview, null, 2));
      process.exit(1);
    }
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          store: storePath,
          server_environment: preview.package.server_environment,
          patch_code: preview.package.patch.patch_code,
          baseline_patch_code: preview.diff.baseline_patch_code,
          summary: preview.diff.summary,
          added_hero_keys: preview.diff.added_hero_keys,
          removed_hero_keys: preview.diff.removed_hero_keys,
          changed_hero_keys: preview.diff.changed_hero_keys,
          change_count: preview.diff.changes.length,
          warnings: preview.warnings,
          note: 'No writes performed. Pass --apply-draft to create/update a draft patch.',
        },
        null,
        2,
      ),
    );
    if (!args.applyDraft) return;
  }

  const imported = await db.importGameKnowledgeAsDraft(knowledge, userId, raw);
  if (!imported.ok) {
    console.error(JSON.stringify(imported, null, 2));
    process.exit(1);
  }
  await saveStore(knowledge);
  console.log(
    JSON.stringify(
      {
        mode: 'apply-draft',
        store: storePath,
        draft_patch_id: imported.result.draft_patch.id,
        patch_code: imported.result.draft_patch.patch_code,
        server_environment: imported.result.draft_patch.server_environment,
        status: imported.result.draft_patch.status,
        created_new_draft: imported.result.created_new_draft,
        summary: imported.result.diff.summary,
        warnings: imported.result.warnings,
        publish_hint: `node scripts/import-game-knowledge.mjs --publish-patch ${imported.result.draft_patch.id} --i-confirm-publish`,
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
