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

export { MemoryProjectRepository } from './memory-project-repository.js';
export { SupabaseProjectRepository } from './supabase-project-repository.js';
export { MemoryStoryRepository } from './memory-story-repository.js';
export { SupabaseStoryRepository } from './supabase-story-repository.js';
export { MemoryCharacterRepository } from './memory-character-repository.js';
export { SupabaseCharacterRepository } from './supabase-character-repository.js';
export { MemoryReferenceAssetRepository } from './memory-reference-asset-repository.js';
export { SupabaseReferenceAssetRepository } from './supabase-reference-asset-repository.js';
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
