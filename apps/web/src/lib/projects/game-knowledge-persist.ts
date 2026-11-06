import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { MemoryGameKnowledgeRepository } from '@ai-shorts-factory/database';
import { resolveDataFile } from '@/lib/data-paths';

function storePath(): string {
  return resolveDataFile('game-knowledge.json', process.env.ASF_GAME_KNOWLEDGE_PATH);
}

export async function loadGameKnowledgeSnapshot(
  knowledge: MemoryGameKnowledgeRepository,
): Promise<boolean> {
  try {
    const raw = await readFile(storePath(), 'utf8');
    const snapshot = JSON.parse(raw) as {
      version?: number;
      knowledge?: ReturnType<MemoryGameKnowledgeRepository['exportAll']>;
    };
    knowledge.importAll(snapshot.knowledge ?? (snapshot as never));
    return true;
  } catch {
    return false;
  }
}

export async function saveGameKnowledgeSnapshot(
  knowledge: MemoryGameKnowledgeRepository,
): Promise<void> {
  const path = storePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
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
