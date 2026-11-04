import {
  MemoryCharacterRepository,
  MemoryProjectRepository,
  MemoryStoryRepository,
  SupabaseCharacterRepository,
  SupabaseProjectRepository,
  SupabaseStoryRepository,
  type CharacterRepository,
  type ProjectRepository,
  type StoryRepository,
  readDatabaseEnv,
} from '@ai-shorts-factory/database';
import { createClient } from '@/lib/supabase/server';

const globalForStudio = globalThis as typeof globalThis & {
  __asfMemoryProjects?: MemoryProjectRepository;
  __asfMemoryStories?: MemoryStoryRepository;
  __asfMemoryCharacters?: MemoryCharacterRepository;
};

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

export async function getProjectRepository(): Promise<ProjectRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
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
    return getMemoryCharacters();
  }
  const supabase = await createClient();
  if (!supabase) {
    throw new Error('Supabase client unavailable while PROJECT_STORE=supabase');
  }
  const projects = new SupabaseProjectRepository(supabase);
  return new SupabaseCharacterRepository(supabase, projects);
}
