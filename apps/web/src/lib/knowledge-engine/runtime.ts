import {
  AutonomousMlbbKnowledgeEngine,
  MemoryKnowledgeEngineStore,
} from '@ai-shorts-factory/knowledge-engine';
import { getGameKnowledgeRepository, scheduleGameKnowledgePersist, persistGameKnowledgeNow } from '@/lib/projects/repository';
import {
  loadKnowledgeEngineSnapshot,
  saveKnowledgeEngineSnapshot,
} from '@/lib/knowledge-engine/persist';

const globalForEngine = globalThis as typeof globalThis & {
  __asfKnowledgeEngineStore?: MemoryKnowledgeEngineStore;
  __asfKnowledgeEngineHydrated?: boolean;
  __asfKnowledgeEnginePersistTimer?: ReturnType<typeof setTimeout>;
};

function getStore(): MemoryKnowledgeEngineStore {
  if (!globalForEngine.__asfKnowledgeEngineStore) {
    globalForEngine.__asfKnowledgeEngineStore = new MemoryKnowledgeEngineStore();
  }
  return globalForEngine.__asfKnowledgeEngineStore;
}

async function ensureHydrated(): Promise<void> {
  if (globalForEngine.__asfKnowledgeEngineHydrated) return;
  await loadKnowledgeEngineSnapshot(getStore());
  globalForEngine.__asfKnowledgeEngineHydrated = true;
}

export function scheduleKnowledgeEnginePersist(): void {
  if (globalForEngine.__asfKnowledgeEnginePersistTimer) {
    clearTimeout(globalForEngine.__asfKnowledgeEnginePersistTimer);
  }
  globalForEngine.__asfKnowledgeEnginePersistTimer = setTimeout(() => {
    void saveKnowledgeEngineSnapshot(getStore());
  }, 250);
}

export async function persistKnowledgeEngineNow(): Promise<void> {
  await saveKnowledgeEngineSnapshot(getStore());
}

export async function getKnowledgeEngineStore(): Promise<MemoryKnowledgeEngineStore> {
  await ensureHydrated();
  return getStore();
}

export async function getAutonomousKnowledgeEngine(options?: {
  heroLimit?: number;
  itemLimit?: number;
  offline?: boolean;
}): Promise<AutonomousMlbbKnowledgeEngine> {
  await ensureHydrated();
  const knowledge = await getGameKnowledgeRepository();
  const offline =
    options?.offline === true || process.env.KNOWLEDGE_ENGINE_OFFLINE === 'true';
  return new AutonomousMlbbKnowledgeEngine({
    store: getStore(),
    knowledge,
    heroLimit: options?.heroLimit ?? Number(process.env.KNOWLEDGE_ENGINE_HERO_LIMIT ?? 60),
    itemLimit: options?.itemLimit ?? Number(process.env.KNOWLEDGE_ENGINE_ITEM_LIMIT ?? 60),
    offlineFixtures: offline
      ? {
          heroes: [],
          patchHtml: [],
        }
      : undefined,
  });
}

export async function afterKnowledgeEngineMutation(): Promise<void> {
  scheduleKnowledgeEnginePersist();
  scheduleGameKnowledgePersist();
  await persistKnowledgeEngineNow();
  await persistGameKnowledgeNow();
}
