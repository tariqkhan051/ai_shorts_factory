#!/usr/bin/env node
/**
 * Milestone 5 — generate grounded match commentary from a timeline + activated patch.
 *
 * Usage:
 *   node scripts/generate-match-commentary.mjs --timeline-id <uuid> --match-source-id <uuid>
 *   node scripts/generate-match-commentary.mjs --timeline-id <uuid> --match-source-id <uuid> --polish-file polished.json
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const knowledgeStore =
  process.env.ASF_GAME_KNOWLEDGE_PATH?.trim() || join(root, '.data', 'game-knowledge.json');
const timelineStore =
  process.env.ASF_MATCH_TIMELINE_PATH?.trim() || join(root, '.data', 'match-timelines.json');

function parseArgs(argv) {
  const args = {
    timelineId: null,
    matchSourceId: null,
    polishFile: null,
    includeColorHook: false,
    out: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--timeline-id') args.timelineId = argv[++i];
    else if (arg === '--match-source-id') args.matchSourceId = argv[++i];
    else if (arg === '--polish-file') args.polishFile = argv[++i];
    else if (arg === '--include-color-hook') args.includeColorHook = true;
    else if (arg === '--out') args.out = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.timelineId || !args.matchSourceId) {
    console.error('Required: --timeline-id <uuid> --match-source-id <uuid> [--polish-file file.json]');
    process.exit(1);
  }

  const db = await import(pathToFileURL(join(root, 'packages/database/dist/index.js')).href);
  const chatgpt = await import(
    pathToFileURL(join(root, 'packages/chatgpt-import/dist/index.js')).href
  );

  const projects = new db.MemoryProjectRepository();
  const videos = new db.MemoryVideoRepository(projects);
  const knowledge = new db.MemoryGameKnowledgeRepository(projects, videos);
  const timelines = new db.MemoryMatchTimelineRepository();
  const userId = process.env.ASF_GAME_KNOWLEDGE_USER_ID?.trim() || 'local-dev-user';

  try {
    knowledge.importAll(JSON.parse(await readFile(knowledgeStore, 'utf8')).knowledge ?? {});
  } catch {
    console.error(`Missing knowledge store: ${knowledgeStore}`);
    process.exit(1);
  }
  try {
    timelines.importAll(JSON.parse(await readFile(timelineStore, 'utf8')));
  } catch {
    console.error(`Missing timeline store: ${timelineStore}`);
    process.exit(1);
  }

  let knowledgeContext;
  try {
    const ke = await import(pathToFileURL(join(root, 'packages/knowledge-engine/dist/index.js')).href);
    const enginePath =
      process.env.ASF_KNOWLEDGE_ENGINE_PATH?.trim() || join(root, '.data', 'knowledge-engine.json');
    const store = new ke.MemoryKnowledgeEngineStore();
    try {
      const snap = JSON.parse(await readFile(enginePath, 'utf8'));
      if (snap.engine) store.importSnapshot(snap.engine);
    } catch {
      /* optional */
    }
    const timeline = await timelines.getTimeline(userId, args.timelineId);
    const heroKeys = [];
    for (const event of timeline?.events ?? []) {
      for (const p of event.participants ?? []) {
        if (p.hero_key) heroKeys.push(p.hero_key);
      }
    }
    knowledgeContext = await ke.buildMatchKnowledgeContextPackage({
      userId,
      knowledge,
      engineStore: store,
      serverEnvironment: timeline.server_environment,
      gamePatchId: timeline.game_patch_id,
      patchResolution: 'bound',
      relevantHeroKeys: [...new Set(heroKeys)],
    });
  } catch {
    knowledgeContext = undefined;
  }

  let built = await db.generateGroundedMatchCommentary({
    userId,
    matchSourceId: args.matchSourceId,
    timelineId: args.timelineId,
    knowledge,
    timelines,
    includeColorHook: args.includeColorHook,
    knowledgeContext: knowledgeContext
      ? {
          grounding_rules: knowledgeContext.grounding_rules,
          heroes: knowledgeContext.heroes.map((h) => ({ hero_key: h.hero_key, name: h.name })),
          patch_code: knowledgeContext.patch_code,
          server_type: knowledgeContext.server_type,
        }
      : undefined,
  });

  if (!built.validation.ok) {
    console.error(JSON.stringify(built.validation, null, 2));
    process.exit(1);
  }

  if (args.polishFile) {
    const polishedJson = await readFile(resolve(args.polishFile), 'utf8');
    const polished = await db.polishGroundedMatchCommentary({
      userId,
      base: built.script,
      polishedJson,
      knowledge,
      timelines,
    });
    if (!polished.ok) {
      console.error(JSON.stringify(polished, null, 2));
      process.exit(1);
    }
    built = { script: polished.script, validation: polished.validation };
  }

  const outPath =
    args.out ||
    join(root, '.data', `commentary-${args.timelineId}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(built.script, null, 2), 'utf8');

  const polishPrompt = chatgpt.buildMatchCommentaryPolishPrompt(built.script);
  const promptPath = join(root, '.data', `commentary-polish-prompt-${args.timelineId}.txt`);
  await writeFile(promptPath, polishPrompt, 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        commentary_path: outPath,
        polish_prompt_path: promptPath,
        line_count: built.script.lines.length,
        validation: built.validation,
        note: 'No paid ChatGPT API called. Use the polish prompt manually if desired.',
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
