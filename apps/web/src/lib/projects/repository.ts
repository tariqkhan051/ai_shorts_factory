import {
  MemoryBrandRepository,
  MemoryCharacterRepository,
  MemoryDistributionRepository,
  MemoryEnvironmentRepository,
  MemoryGameKnowledgeRepository,
  MemoryProjectDnaRepository,
  MemoryProjectRepository,
  MemoryReferenceAssetRepository,
  MemorySocialAccountRepository,
  MemoryStoryRepository,
  MemoryVideoRepository,
  SupabaseBrandRepository,
  SupabaseCharacterRepository,
  SupabaseDistributionRepository,
  SupabaseEnvironmentRepository,
  SupabaseProjectDnaRepository,
  SupabaseProjectRepository,
  SupabaseReferenceAssetRepository,
  SupabaseSocialAccountRepository,
  SupabaseStoryRepository,
  SupabaseVideoRepository,
  migrateLegacyProjectsToContentPlatform,
  type BrandRepository,
  type CharacterRepository,
  type DistributionRepository,
  type EnvironmentRepository,
  type GameKnowledgeRepository,
  type ProjectDnaRepository,
  type ProjectRepository,
  type ReferenceAssetRepository,
  type SocialAccountRepository,
  type StoryRepository,
  type VideoRepository,
  readDatabaseEnv,
} from '@ai-shorts-factory/database';
import {
  loadGameKnowledgeSnapshot,
  saveGameKnowledgeSnapshot,
} from '@/lib/projects/game-knowledge-persist';
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
  __asfMemoryBrands?: MemoryBrandRepository;
  __asfMemoryDna?: MemoryProjectDnaRepository;
  __asfMemoryVideos?: MemoryVideoRepository;
  __asfMemoryEnvironments?: MemoryEnvironmentRepository;
  __asfMemorySocial?: MemorySocialAccountRepository;
  __asfMemoryDistributions?: MemoryDistributionRepository;
  __asfMemoryGameKnowledge?: MemoryGameKnowledgeRepository;
  __asfGameKnowledgeHydrated?: boolean;
  __asfGameKnowledgePersistTimer?: ReturnType<typeof setTimeout>;
  __asfScenes?: Map<string, GenerationSceneRecord[]>;
  __asfMemoryHydrated?: boolean;
  __asfMemoryPersistTimer?: ReturnType<typeof setTimeout>;
};

const MEMORY_USER_ID = 'local-dev-user';

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

function getMemoryBrands(): MemoryBrandRepository {
  if (!globalForStudio.__asfMemoryBrands) {
    globalForStudio.__asfMemoryBrands = new MemoryBrandRepository();
  }
  return globalForStudio.__asfMemoryBrands;
}

function getMemoryDna(): MemoryProjectDnaRepository {
  if (!globalForStudio.__asfMemoryDna) {
    globalForStudio.__asfMemoryDna = new MemoryProjectDnaRepository(getMemoryProjects());
  }
  return globalForStudio.__asfMemoryDna;
}

function getMemoryVideos(): MemoryVideoRepository {
  if (!globalForStudio.__asfMemoryVideos) {
    globalForStudio.__asfMemoryVideos = new MemoryVideoRepository(getMemoryProjects());
  }
  return globalForStudio.__asfMemoryVideos;
}

function getMemoryEnvironments(): MemoryEnvironmentRepository {
  if (!globalForStudio.__asfMemoryEnvironments) {
    globalForStudio.__asfMemoryEnvironments = new MemoryEnvironmentRepository(getMemoryProjects());
  }
  return globalForStudio.__asfMemoryEnvironments;
}

function getMemorySocial(): MemorySocialAccountRepository {
  if (!globalForStudio.__asfMemorySocial) {
    globalForStudio.__asfMemorySocial = new MemorySocialAccountRepository(getMemoryProjects());
  }
  return globalForStudio.__asfMemorySocial;
}

function getMemoryDistributions(): MemoryDistributionRepository {
  if (!globalForStudio.__asfMemoryDistributions) {
    globalForStudio.__asfMemoryDistributions = new MemoryDistributionRepository(
      getMemoryVideos(),
      getMemorySocial(),
    );
  }
  return globalForStudio.__asfMemoryDistributions;
}

function getMemoryGameKnowledge(): MemoryGameKnowledgeRepository {
  if (!globalForStudio.__asfMemoryGameKnowledge) {
    globalForStudio.__asfMemoryGameKnowledge = new MemoryGameKnowledgeRepository(
      getMemoryProjects(),
      getMemoryVideos(),
    );
  }
  return globalForStudio.__asfMemoryGameKnowledge;
}

async function ensureGameKnowledgeHydrated(): Promise<void> {
  // Game knowledge is always memory-backed (persisted separately under .data/).
  await ensureMemoryHydrated();
  const knowledge = getMemoryGameKnowledge();
  if (globalForStudio.__asfGameKnowledgeHydrated) {
    // Recover from empty first-load when the store path was wrong (apps/web vs repo root).
    const existing = knowledge.exportAll();
    if (existing.profiles.length > 0 || existing.patches.length > 0) return;
  }
  globalForStudio.__asfGameKnowledgeHydrated = true;
  await loadGameKnowledgeSnapshot(knowledge);
}

export function scheduleGameKnowledgePersist(): void {
  if (globalForStudio.__asfGameKnowledgePersistTimer) {
    clearTimeout(globalForStudio.__asfGameKnowledgePersistTimer);
  }
  globalForStudio.__asfGameKnowledgePersistTimer = setTimeout(() => {
    void saveGameKnowledgeSnapshot(getMemoryGameKnowledge()).catch(() => {
      // Persistence failures must not break request paths.
    });
  }, 50);
}

export async function persistGameKnowledgeNow(): Promise<void> {
  await saveGameKnowledgeSnapshot(getMemoryGameKnowledge());
}

function memoryPersistPayload() {
  return {
    projects: getMemoryProjects(),
    stories: getMemoryStories(),
    characters: getMemoryCharacters(),
    references: getMemoryReferences(),
    scenes: getSceneMap(),
    brands: getMemoryBrands(),
    dna: getMemoryDna(),
    videos: getMemoryVideos(),
    environments: getMemoryEnvironments(),
    social: getMemorySocial(),
    distributions: getMemoryDistributions(),
  };
}

async function ensureMemoryHydrated(): Promise<void> {
  if (globalForStudio.__asfMemoryHydrated) return;
  globalForStudio.__asfMemoryHydrated = true;
  await loadMemoryStudioSnapshot(memoryPersistPayload());

  const userIds = new Set(
    getMemoryProjects()
      .exportAll()
      .map((p) => p.user_id),
  );
  if (userIds.size === 0) userIds.add(MEMORY_USER_ID);
  for (const userId of userIds) {
    await migrateLegacyProjectsToContentPlatform({
      brands: getMemoryBrands(),
      projects: getMemoryProjects(),
      dna: getMemoryDna(),
      videos: getMemoryVideos(),
      userId,
    });
  }
}

export function scheduleMemoryStudioPersist(): void {
  if (readDatabaseEnv(process.env).store !== 'memory') return;
  if (globalForStudio.__asfMemoryPersistTimer) {
    clearTimeout(globalForStudio.__asfMemoryPersistTimer);
  }
  globalForStudio.__asfMemoryPersistTimer = setTimeout(() => {
    void saveMemoryStudioSnapshot(memoryPersistPayload()).catch(() => {
      // Persistence failures must not break request paths.
    });
  }, 50);
}

export async function persistMemoryStudioNow(): Promise<void> {
  if (readDatabaseEnv(process.env).store !== 'memory') return;
  await saveMemoryStudioSnapshot(memoryPersistPayload());
}

async function requireSupabase() {
  const supabase = await createClient();
  if (!supabase) {
    throw new Error('Supabase client unavailable while PROJECT_STORE=supabase');
  }
  return supabase;
}

export async function getProjectRepository(): Promise<ProjectRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    await ensureMemoryHydrated();
    return getMemoryProjects();
  }
  return new SupabaseProjectRepository(await requireSupabase());
}

export async function getStoryRepository(): Promise<StoryRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    await ensureMemoryHydrated();
    return getMemoryStories();
  }
  const supabase = await requireSupabase();
  const projects = new SupabaseProjectRepository(supabase);
  return new SupabaseStoryRepository(supabase, projects);
}

export async function getCharacterRepository(): Promise<CharacterRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    await ensureMemoryHydrated();
    return getMemoryCharacters();
  }
  const supabase = await requireSupabase();
  const projects = new SupabaseProjectRepository(supabase);
  return new SupabaseCharacterRepository(supabase, projects);
}

export async function getReferenceAssetRepository(): Promise<ReferenceAssetRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    await ensureMemoryHydrated();
    return getMemoryReferences();
  }
  const supabase = await requireSupabase();
  const projects = new SupabaseProjectRepository(supabase);
  const characters = new SupabaseCharacterRepository(supabase, projects);
  return new SupabaseReferenceAssetRepository(supabase, characters);
}

export async function getBrandRepository(): Promise<BrandRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    await ensureMemoryHydrated();
    return getMemoryBrands();
  }
  return new SupabaseBrandRepository(await requireSupabase());
}

export async function getProjectDnaRepository(): Promise<ProjectDnaRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    await ensureMemoryHydrated();
    return getMemoryDna();
  }
  const supabase = await requireSupabase();
  const projects = new SupabaseProjectRepository(supabase);
  return new SupabaseProjectDnaRepository(supabase, projects);
}

export async function getVideoRepository(): Promise<VideoRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    await ensureMemoryHydrated();
    return getMemoryVideos();
  }
  const supabase = await requireSupabase();
  const projects = new SupabaseProjectRepository(supabase);
  return new SupabaseVideoRepository(supabase, projects);
}

export async function getEnvironmentRepository(): Promise<EnvironmentRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    await ensureMemoryHydrated();
    return getMemoryEnvironments();
  }
  const supabase = await requireSupabase();
  const projects = new SupabaseProjectRepository(supabase);
  return new SupabaseEnvironmentRepository(supabase, projects);
}

export async function getSocialAccountRepository(): Promise<SocialAccountRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    await ensureMemoryHydrated();
    return getMemorySocial();
  }
  const supabase = await requireSupabase();
  const projects = new SupabaseProjectRepository(supabase);
  return new SupabaseSocialAccountRepository(supabase, projects);
}

export async function getDistributionRepository(): Promise<DistributionRepository> {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    await ensureMemoryHydrated();
    return getMemoryDistributions();
  }
  const supabase = await requireSupabase();
  const projects = new SupabaseProjectRepository(supabase);
  const videos = new SupabaseVideoRepository(supabase, projects);
  const social = new SupabaseSocialAccountRepository(supabase, projects);
  return new SupabaseDistributionRepository(supabase, videos, social);
}

/**
 * Reassign CLI/local-operator KB ownership to the signed-in portal user.
 * Needed when PROJECT_STORE=supabase but Game KB remains file/memory-backed under `local-dev-user`.
 */
function adoptLocalGameKnowledgeIfNeeded(
  knowledge: MemoryGameKnowledgeRepository,
  userId: string,
): boolean {
  const snap = knowledge.exportAll();
  if (snap.profiles.some((profile) => profile.user_id === userId)) return false;
  if (snap.profiles.length === 0) return false;

  const localOwners = new Set([
    MEMORY_USER_ID,
    'local-dev-user',
    '00000000-0000-4000-8000-000000000001',
  ]);
  const owners = [...new Set(snap.profiles.map((profile) => profile.user_id))];
  const sourceOwner =
    owners.find((owner) => localOwners.has(owner)) ?? (owners.length === 1 ? owners[0] : null);
  if (!sourceOwner || sourceOwner === userId) return false;

  knowledge.importAll({
    ...snap,
    profiles: snap.profiles.map((profile) =>
      profile.user_id === sourceOwner ? { ...profile, user_id: userId } : profile,
    ),
  });
  scheduleGameKnowledgePersist();
  return true;
}

/**
 * Milestone 2 game knowledge store (memory + `.data/game-knowledge.json`).
 * Import creates drafts only; publish requires explicit confirmation phrase.
 */
export async function getGameKnowledgeRepository(options?: {
  /** When set, adopt local CLI KB rows for this signed-in user if they own none yet. */
  adoptForUserId?: string;
}): Promise<GameKnowledgeRepository> {
  await ensureGameKnowledgeHydrated();
  const knowledge = getMemoryGameKnowledge();
  if (options?.adoptForUserId) {
    adoptLocalGameKnowledgeIfNeeded(knowledge, options.adoptForUserId);
  }
  return knowledge;
}

/** Platform deps for createProjectWithPlatform / createVideoInProject (memory or supabase). */
export async function getContentPlatformDeps() {
  const env = readDatabaseEnv(process.env);
  if (env.store === 'memory') {
    await ensureMemoryHydrated();
    return {
      brands: getMemoryBrands(),
      projects: getMemoryProjects(),
      dna: getMemoryDna(),
      videos: getMemoryVideos(),
    };
  }
  const supabase = await requireSupabase();
  const projects = new SupabaseProjectRepository(supabase);
  return {
    brands: new SupabaseBrandRepository(supabase),
    projects,
    dna: new SupabaseProjectDnaRepository(supabase, projects),
    videos: new SupabaseVideoRepository(supabase, projects),
  };
}
