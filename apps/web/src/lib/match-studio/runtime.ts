import {
  MemoryMatchAnalysisRepository,
  MemoryMatchCommentaryRepository,
  MemoryMatchEditRepository,
  MemoryMatchStudioRepository,
  MemoryMatchTimelineRepository,
  SupabaseMatchAnalysisRepository,
  SupabaseMatchCommentaryRepository,
  SupabaseMatchEditRepository,
  SupabaseMatchStudioRepository,
  SupabaseMatchTimelineRepository,
  canCreateSqlQueryClient,
  createSqlQueryClient,
  ensureMatchStudioKnowledgeRefs,
  readDatabaseEnv,
  type MatchAnalysisRepository,
  type MatchCommentaryRepository,
  type MatchEditRepository,
  type MatchStudioRepository,
  type MatchTimelineRepository,
  type GameKnowledgeRepository,
} from '@ai-shorts-factory/database';
import { createJobQueue, type JobQueue } from '@ai-shorts-factory/workflow-engine';
import { createClient } from '@/lib/supabase/server';

const globalForMatch = globalThis as typeof globalThis & {
  __asfMatchStudio?: MemoryMatchStudioRepository;
  __asfMatchAnalysis?: MemoryMatchAnalysisRepository;
  __asfMatchTimelines?: MemoryMatchTimelineRepository;
  __asfMatchEdits?: MemoryMatchEditRepository;
  __asfMatchCommentary?: MemoryMatchCommentaryRepository;
  __asfMatchJobs?: JobQueue;
};

async function requireSupabaseForMatchStudio() {
  const env = readDatabaseEnv(process.env);
  if (env.store !== 'supabase') {
    throw new Error('Supabase Match Studio repositories require PROJECT_STORE=supabase');
  }
  const supabase = await createClient();
  if (!supabase) {
    throw new Error(
      'Supabase client unavailable while PROJECT_STORE=supabase. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. See SUPABASE_SETUP_GUIDE.md.',
    );
  }
  return supabase;
}

export async function getMatchStudioRepository(): Promise<MatchStudioRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    if (!globalForMatch.__asfMatchStudio) {
      globalForMatch.__asfMatchStudio = new MemoryMatchStudioRepository();
    }
    return globalForMatch.__asfMatchStudio;
  }
  return new SupabaseMatchStudioRepository(await requireSupabaseForMatchStudio());
}

export async function getMatchAnalysisRepository(): Promise<MatchAnalysisRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    if (!globalForMatch.__asfMatchAnalysis) {
      globalForMatch.__asfMatchAnalysis = new MemoryMatchAnalysisRepository();
    }
    return globalForMatch.__asfMatchAnalysis;
  }
  return new SupabaseMatchAnalysisRepository(await requireSupabaseForMatchStudio());
}

export async function getMatchTimelineRepository(): Promise<MatchTimelineRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    if (!globalForMatch.__asfMatchTimelines) {
      globalForMatch.__asfMatchTimelines = new MemoryMatchTimelineRepository();
    }
    return globalForMatch.__asfMatchTimelines;
  }
  return new SupabaseMatchTimelineRepository(await requireSupabaseForMatchStudio());
}

export async function getMatchEditRepository(): Promise<MatchEditRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    if (!globalForMatch.__asfMatchEdits) {
      globalForMatch.__asfMatchEdits = new MemoryMatchEditRepository();
    }
    return globalForMatch.__asfMatchEdits;
  }
  return new SupabaseMatchEditRepository(await requireSupabaseForMatchStudio());
}

export async function getMatchCommentaryRepository(): Promise<MatchCommentaryRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    if (!globalForMatch.__asfMatchCommentary) {
      globalForMatch.__asfMatchCommentary = new MemoryMatchCommentaryRepository();
    }
    return globalForMatch.__asfMatchCommentary;
  }
  return new SupabaseMatchCommentaryRepository(await requireSupabaseForMatchStudio());
}

export async function createMatchStudioKnowledgeEnsure(
  knowledge: GameKnowledgeRepository,
): Promise<
  | ((
      userId: string,
      refs: { gameProfileId: string; gamePatchId: string | null },
    ) => Promise<void>)
  | undefined
> {
  const env = readDatabaseEnv(process.env);
  if (env.store !== 'supabase') return undefined;
  const client = await requireSupabaseForMatchStudio();
  return (userId, refs) => ensureMatchStudioKnowledgeRefs(client, knowledge, userId, refs);
}

export async function getMatchJobQueue(): Promise<JobQueue> {
  if (!globalForMatch.__asfMatchJobs) {
    const mode = process.env.MATCH_JOB_QUEUE?.trim().toLowerCase() ?? 'file';
    if (mode === 'postgres') {
      if (!canCreateSqlQueryClient(process.env)) {
        throw new Error(
          'MATCH_JOB_QUEUE=postgres requires SUPABASE_DB_URL. See SUPABASE_SETUP_GUIDE.md.',
        );
      }
      const sql = await createSqlQueryClient(process.env);
      globalForMatch.__asfMatchJobs = createJobQueue({ env: process.env, sqlClient: sql });
    } else {
      globalForMatch.__asfMatchJobs = createJobQueue({ env: process.env });
    }
  }
  return globalForMatch.__asfMatchJobs;
}
