import {
  MemoryCharacterRepository,
  MemoryProjectRepository,
  MemoryReferenceAssetRepository,
  MemoryStoryRepository,
  SupabaseCharacterRepository,
  SupabaseProjectRepository,
  SupabaseReferenceAssetRepository,
  SupabaseStoryRepository,
  type CharacterRepository,
  type ProjectRepository,
  type ReferenceAssetRepository,
  type StoryRepository,
  readDatabaseEnv,
} from '@ai-shorts-factory/database';
import type { GenerationSceneRecord } from '@ai-shorts-factory/workflow-engine';
import { createClient } from '@/lib/supabase/server';
import {
  loadMemoryStudioSnapshot,
  saveMemoryStudioSnapshot,
} from '@/lib/projects/memory-studio-persist';

const globalForStudio = globalThis as typeof globalThis & {
  __asfMemoryProjects?: MemoryProjectRepository;
  __asfMemoryStories?: MemoryStoryRepository;
  __asfMemoryCharacters?: MemoryCharacterRepository;
  __asfMemoryReferences?: MemoryReferenceAssetRepository;
  __asfScenes?: Map<string, GenerationSceneRecord[]>;
  __asfMemoryHydrated?: boolean;
  __asfMemoryPersistTimer?: ReturnType<typeof setTimeout>;
};

export function getSceneMap(): Map<string, GenerationSceneRecord[]> {
  if (!globalForStudio.__asfScenes) {
    globalForStudio.__asfScenes = new Map();
  }
  return globalForStudio.__asfScenes;
}

function getMemoryProjects(): MemoryProjectRepository {
  if (!globalForStudio.__asfMemoryProjects) {
    globalForStudio.__asfMemoryProjects = new MemoryProjectRepository();
  }
  return globalForStudio.__asfMemoryProjects;
}

function getMemoryStories(): MemoryStoryRepository {
  if (!globalForStudio.__asfMemoryStories) {
    globalForStudio.__asfMemoryStories = new MemoryStoryRepository(getMemoryProjects());
  }
  return globalForStudio.__asfMemoryStories;
}

function getMemoryCharacters(): MemoryCharacterRepository {
  if (!globalForStudio.__asfMemoryCharacters) {
    globalForStudio.__asfMemoryCharacters = new MemoryCharacterRepository(getMemoryProjects());
  }
  return globalForStudio.__asfMemoryCharacters;
}

function getMemoryReferences(): MemoryReferenceAssetRepository {
  if (!globalForStudio.__asfMemoryReferences) {
    globalForStudio.__asfMemoryReferences = new MemoryReferenceAssetRepository(
      getMemoryCharacters(),
    );
  }
  return globalForStudio.__asfMemoryReferences;
}

async function ensureMemoryHydrated(): Promise<void> {
  if (globalForStudio.__asfMemoryHydrated) return;
  globalForStudio.__asfMemoryHydrated = true;
  await loadMemoryStudioSnapshot({
    projects: getMemoryProjects(),
    stories: getMemoryStories(),
    characters: getMemoryCharacters(),
    references: getMemoryReferences(),
    scenes: getSceneMap(),
  });
}

export function scheduleMemoryStudioPersist(): void {
  if (readDatabaseEnv(process.env).store !== 'memory') return;
  if (globalForStudio.__asfMemoryPersistTimer) {
    clearTimeout(globalForStudio.__asfMemoryPersistTimer);
  }
  globalForStudio.__asfMemoryPersistTimer = setTimeout(() => {
    void saveMemoryStudioSnapshot({
      projects: getMemoryProjects(),
      stories: getMemoryStories(),
      characters: getMemoryCharacters(),
      references: getMemoryReferences(),
      scenes: getSceneMap(),
    }).catch(() => {
      // Persistence failures must not break request paths.
    });
  }, 50);
}

export async function persistMemoryStudioNow(): Promise<void> {
  if (readDatabaseEnv(process.env).store !== 'memory') return;
  await saveMemoryStudioSnapshot({
    projects: getMemoryProjects(),
    stories: getMemoryStories(),
    characters: getMemoryCharacters(),
    references: getMemoryReferences(),
    scenes: getSceneMap(),
  });
}

export async function getProjectRepository(): Promise<ProjectRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    await ensureMemoryHydrated();
    return getMemoryProjects();
  }
  const supabase = await createClient();
  if (!supabase) {
    throw new Error('Supabase client unavailable while PROJECT_STORE=supabase');
  }
  return new SupabaseProjectRepository(supabase);
}

export async function getStoryRepository(): Promise<StoryRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    await ensureMemoryHydrated();
    return getMemoryStories();
  }
  const supabase = await createClient();
  if (!supabase) {
    throw new Error('Supabase client unavailable while PROJECT_STORE=supabase');
  }
  const projects = new SupabaseProjectRepository(supabase);
  return new SupabaseStoryRepository(supabase, projects);
}

export async function getCharacterRepository(): Promise<CharacterRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    await ensureMemoryHydrated();
    return getMemoryCharacters();
  }
  const supabase = await createClient();
  if (!supabase) {
    throw new Error('Supabase client unavailable while PROJECT_STORE=supabase');
  }
  const projects = new SupabaseProjectRepository(supabase);
  return new SupabaseCharacterRepository(supabase, projects);
}

export async function getReferenceAssetRepository(): Promise<ReferenceAssetRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    await ensureMemoryHydrated();
    return getMemoryReferences();
  }
  const supabase = await createClient();
  if (!supabase) {
    throw new Error('Supabase client unavailable while PROJECT_STORE=supabase');
  }
  const projects = new SupabaseProjectRepository(supabase);
  const characters = new SupabaseCharacterRepository(supabase, projects);
  return new SupabaseReferenceAssetRepository(supabase, characters);
}
