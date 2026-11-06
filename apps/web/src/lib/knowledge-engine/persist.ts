import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  MemoryKnowledgeEngineStore,
  type MemoryEngineSnapshot,
} from '@ai-shorts-factory/knowledge-engine';
import { resolveDataFile } from '@/lib/data-paths';

function storePath(): string {
  return resolveDataFile('knowledge-engine.json', process.env.ASF_KNOWLEDGE_ENGINE_PATH);
}

export async function loadKnowledgeEngineSnapshot(
  store: MemoryKnowledgeEngineStore,
): Promise<boolean> {
  try {
    const raw = await readFile(storePath(), 'utf8');
    const snapshot = JSON.parse(raw) as {
      version?: number;
      engine?: MemoryEngineSnapshot;
    };
    if (snapshot.engine) store.importSnapshot(snapshot.engine);
    return true;
  } catch {
    return false;
  }
}

export async function saveKnowledgeEngineSnapshot(
  store: MemoryKnowledgeEngineStore,
): Promise<void> {
  const path = storePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(
      {
        version: 1,
        savedAt: new Date().toISOString(),
        engine: store.exportSnapshot(),
      },
      null,
      2,
    ),
    'utf8',
  );
}
