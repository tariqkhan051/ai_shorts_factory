/**
 * Package: @ai-shorts-factory/database
 * Supabase PostgreSQL clients, migrations, RLS-aware project/story access.
 */

export const PACKAGE_NAME = '@ai-shorts-factory/database' as const;
export const PACKAGE_PHASE = 2 as const;
export const PACKAGE_STATUS = 'active' as const;

export type {
  ProjectInputRecord,
  ProjectRecord,
  DashboardStats,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectRepository,
} from './types.js';

export type {
  StoryRecord,
  StoryVersionRecord,
  StoryWithCurrentVersion,
  CharacterRecord,
  CharacterVersionRecord,
  CharacterVisualIdentity,
  CreateCharacterInput,
  UpdateCharacterInput,
  ReferenceAssetRecord,
  CreateReferenceAssetInput,
  LibraryNameConflict,
  SyncCharactersResult,
  StoryRepository,
  CharacterRepository,
  ReferenceAssetRepository,
} from './story-types.js';

export type {
  BrandRecord,
  ProjectDnaVersionRecord,
  VideoContextSnapshot,
  VideoRecord,
  EnvironmentRecord,
  SocialAccountRecord,
  ProjectSocialAccountRecord,
  VideoDistributionRecord,
  DistributionRetryEntry,
  BrandRepository,
  ProjectDnaRepository,
  VideoRepository,
  EnvironmentRepository,
  SocialAccountRepository,
  DistributionRepository,
} from './content-platform-types.js';

export { MemoryProjectRepository } from './memory-project-repository.js';
export { SupabaseProjectRepository } from './supabase-project-repository.js';
export { MemoryStoryRepository } from './memory-story-repository.js';
export { SupabaseStoryRepository } from './supabase-story-repository.js';
export { MemoryCharacterRepository } from './memory-character-repository.js';
export { SupabaseCharacterRepository } from './supabase-character-repository.js';
export { MemoryReferenceAssetRepository } from './memory-reference-asset-repository.js';
export { SupabaseReferenceAssetRepository } from './supabase-reference-asset-repository.js';
export { MemoryBrandRepository } from './memory-brand-repository.js';
export { MemoryProjectDnaRepository } from './memory-project-dna-repository.js';
export { MemoryVideoRepository } from './memory-video-repository.js';
export { MemoryEnvironmentRepository } from './memory-environment-repository.js';
export { MemorySocialAccountRepository } from './memory-social-account-repository.js';
export { MemoryDistributionRepository } from './memory-distribution-repository.js';
export { SupabaseBrandRepository } from './supabase-brand-repository.js';
export { SupabaseProjectDnaRepository } from './supabase-project-dna-repository.js';
export { SupabaseVideoRepository } from './supabase-video-repository.js';
export { SupabaseEnvironmentRepository } from './supabase-environment-repository.js';
export { SupabaseSocialAccountRepository } from './supabase-social-account-repository.js';
export { SupabaseDistributionRepository } from './supabase-distribution-repository.js';
export {
  mapBrandRow,
  mapDnaVersionRow,
  mapVideoRow,
  mapVideoContextSnapshot,
  mapEnvironmentRow,
  mapSocialAccountRow,
  mapDistributionRow,
} from './content-platform-mappers.js';
export {
  createProjectWithPlatform,
  createVideoInProject,
} from './content-platform-service.js';
export { migrateLegacyProjectsToContentPlatform } from './migrate-legacy-to-platform.js';
export { dnaSnapshotFromProject, videoContextFromDna } from './dna-helpers.js';
export {
  syncCharactersFromScreenplay,
  scenesForCharacter,
} from './sync-characters-from-screenplay.js';
export {
  flattenVisualIdentity,
  mergeVisualIdentity,
  normalizeStoredVisualIdentity,
  EMPTY_VISUAL_IDENTITY,
} from './character-visual.js';
export {
  readDatabaseEnv,
  isSupabaseConfigured,
  type DatabaseEnv,
  type DataStoreMode,
} from './config.js';
export { canTransition, assertTransition, planTransitionPath } from './workflow-transitions.js';

export function getPackageMeta() {
  return {
    name: PACKAGE_NAME,
    phase: PACKAGE_PHASE,
    status: PACKAGE_STATUS,
    description: 'Supabase PostgreSQL client, migrations helpers, RLS-aware data access',
  } as const;
}
