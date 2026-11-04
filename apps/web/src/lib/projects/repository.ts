import {
  MemoryProjectRepository,
  SupabaseProjectRepository,
  type ProjectRepository,
  readDatabaseEnv,
} from '@ai-shorts-factory/database';
import { createClient } from '@/lib/supabase/server';

const globalForProjects = globalThis as typeof globalThis & {
  __asfMemoryProjects?: MemoryProjectRepository;
};

function getMemoryRepository(): MemoryProjectRepository {
  if (!globalForProjects.__asfMemoryProjects) {
    globalForProjects.__asfMemoryProjects = new MemoryProjectRepository();
  }
  return globalForProjects.__asfMemoryProjects;
}

export async function getProjectRepository(): Promise<ProjectRepository> {
  const env = readDatabaseEnv(process.env);

  if (env.store === 'memory') {
    return getMemoryRepository();
  }

  const supabase = await createClient();
  if (!supabase) {
    throw new Error('Supabase client unavailable while PROJECT_STORE=supabase');
  }

  return new SupabaseProjectRepository(supabase);
}
