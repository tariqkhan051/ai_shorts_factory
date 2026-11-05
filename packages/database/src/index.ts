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
  isSupabaseServiceConfigured,
  isSupabaseDbUrlConfigured,
  getSupabasePublicConfig,
  assertSupabaseConfig,
  describeSupabaseReadiness,
  type DatabaseEnv,
  type DataStoreMode,
  type SupabasePublicConfig,
  type SupabaseServiceConfig,
  type AssertSupabaseOptions,
} from './config.js';
export {
  createServiceSupabaseClient,
  createAnonSupabaseClient,
  resolveDatabaseEnvForWorker,
} from './supabase-clients.js';
export {
  createSqlQueryClient,
  closeSharedSqlQueryClient,
  canCreateSqlQueryClient,
  getDatabaseUrlHint,
  type SqlQueryClient,
} from './pg-client.js';
export { canTransition, assertTransition, planTransitionPath } from './workflow-transitions.js';

export type {
  GameProfileRecord,
  GameServerProfileRecord,
  GamePatchRecord,
  KnowledgeSourceRecord,
  HeroKnowledgeRecord,
  AbilityKnowledgeRecord,
  ActivatedGameKnowledge,
  ProjectGameKnowledgeBinding,
  VideoGameKnowledgeBinding,
  GameKnowledgeRepository,
} from './game-knowledge-types.js';
export {
  GameKnowledgeActivationError,
  assertPatchPublished,
  assertPatchEnvironmentMatch,
  assertPatchBelongsToProfile,
  assertPatchMutable,
  assertCanActivatePatch,
  filterAbilitiesForEnvironment,
  assertNoExperimentalLeak,
} from './game-knowledge-activation.js';
export { MemoryGameKnowledgeRepository } from './memory-game-knowledge-repository.js';
export {
  diffGameKnowledge,
  snapshotFromImport,
  snapshotFromRecords,
  type GameKnowledgeDiff,
  type GameKnowledgeDiffChange,
  type GameKnowledgeSnapshot,
} from './game-knowledge-diff.js';
export {
  previewGameKnowledgeImport,
  importGameKnowledgeAsDraft,
  publishGameKnowledgeWithConfirmation,
  parseGameKnowledgeImportJsonText,
  PUBLISH_GAME_KNOWLEDGE_PHRASE,
  type GameKnowledgeImportPreview,
  type GameKnowledgeImportPreviewFailure,
  type GameKnowledgeDraftImportResult,
} from './game-knowledge-import.js';

export type {
  MatchSourceRecord,
  MatchRosterEntry,
  MatchOcrRegionEvidence,
  MatchRosterAnalysisResult,
  MatchAnalysisJobRecord,
  CreateMatchSourceInput,
  UpdateMatchSourceInput,
  MatchAnalysisRepository,
} from './match-analysis-types.js';
export type {
  MatchStudioRunRecord,
  CreateMatchStudioRunRecordInput,
  UpdateMatchStudioRunInput,
  MatchStudioRepository,
} from './match-studio-types.js';
export { MemoryMatchStudioRepository } from './memory-match-studio-repository.js';
export { SupabaseMatchStudioRepository } from './supabase-match-studio-repository.js';
export { SupabaseMatchAnalysisRepository } from './supabase-match-analysis-repository.js';
export { SupabaseMatchTimelineRepository } from './supabase-match-timeline-repository.js';
export { SupabaseMatchEditRepository } from './supabase-match-edit-repository.js';
export { MemoryMatchCommentaryRepository } from './memory-match-commentary-repository.js';
export { SupabaseMatchCommentaryRepository } from './supabase-match-commentary-repository.js';
export { ensureMatchStudioKnowledgeRefs } from './ensure-match-studio-knowledge-refs.js';
export {
  assertRunOwnedByUser,
  assertSourceOwnedByUser,
  assertJobOwnedByUser,
  assertStorageKeyBelongsToRun,
  buildMatchStudioStorageKeyPrefix,
  type MatchStudioJobOwnershipView,
} from './match-studio-ownership.js';
export type {
  MatchCommentaryRepository,
  MatchCommentaryScriptRecord,
  MatchCommentaryApprovalStatus,
  SaveMatchCommentaryInput,
} from './match-commentary-types.js';
export {
  createMatchStudioRun,
  transitionMatchStudioRun,
  attachRecordingToMatchStudioRun,
  bindPatchToMatchStudioRun,
  type MatchStudioCreateDeps,
} from './match-studio-service.js';
export {
  matchHeroFromCatalog,
  parseRosterLines,
  measureRosterPrecision,
  type HeroCatalogEntry,
  type HeroMatch,
  type ParsedRosterLine,
} from './match-analysis-hero-match.js';
export { MemoryMatchAnalysisRepository } from './memory-match-analysis-repository.js';
export {
  ingestMatchVideo,
  analyzeMatchRoster,
  buildMatchAnalysisCacheKey,
  type AnalyzeMatchRosterDeps,
} from './match-analysis-pipeline.js';

export type {
  MatchTimelineRecord,
  MatchTimelineWithEvents,
  MatchTimelineRepository,
} from './match-event-types.js';
export {
  detectEventsFromOcrText,
  buildEventWindows,
  dedupeEventSeeds,
  toMatchEventCandidate,
  type DetectedEventSeed,
} from './match-event-detect.js';
export { MemoryMatchTimelineRepository } from './memory-match-timeline-repository.js';
export {
  analyzeMatchEventTimeline,
  buildEventTimelineCacheKey,
  type AnalyzeMatchTimelineDeps,
} from './match-event-pipeline.js';

export {
  validateMatchCommentary,
  validateCommentaryPolishAgainstBase,
  type CommentaryValidationIssue,
  type CommentaryValidationResult,
} from './match-commentary-validate.js';
export {
  buildMatchCommentary,
  attachAbilityMention,
  type BuildMatchCommentaryInput,
  type BuildMatchCommentaryResult,
} from './match-commentary-builder.js';
export {
  applyMatchCommentaryPolish,
  type ApplyCommentaryPolishResult,
} from './match-commentary-polish.js';
export {
  generateGroundedMatchCommentary,
  polishGroundedMatchCommentary,
} from './match-commentary-service.js';
export { commentaryScriptToSegments } from './match-commentary-segments.js';

export { buildMatchEditPlan, type BuildMatchEditPlanInput } from './match-edit-plan.js';
export {
  buildCondensedCaptionCues,
  buildShortCaptionCues,
} from './match-edit-captions.js';
export {
  approveMatchEditForDistribution,
  type ApproveMatchEditResult,
} from './match-edit-approve.js';
export {
  assembleMatchEditFromTimeline,
  type AssembleMatchEditInput,
  type AssembleMatchEditResult,
} from './match-edit-pipeline.js';
export { MemoryMatchEditRepository } from './memory-match-edit-repository.js';
export type {
  MatchEditStored,
  MatchEditRepository,
} from './match-edit-types.js';

export {
  pullKbArtifactsAsDrafts,
  type PullKbArtifactsInput,
} from './kb-artifact-sync.js';
export { MemoryKbSyncRepository } from './memory-kb-sync-repository.js';
export type {
  KbSyncChecksumRecord,
  KbSyncRepository,
} from './kb-sync-types.js';
export {
  assertMatchSpendAllowed,
  reserveMatchSpend,
  recordMatchUnknownSpend,
  readMatchSpendFlagsFromEnv,
  emptyMatchSpendFlags,
  type MatchSpendGateResult,
  type RecordMatchSpendResult,
} from './match-spend.js';
export {
  MemoryMatchCacheMetricsRepository,
  recordMatchCacheAccess,
  summarizeMatchCacheMetrics,
  type MatchCacheKind,
  type MatchCacheMetricsRepository,
} from './match-cache-metrics.js';

export function getPackageMeta() {
  return {
    name: PACKAGE_NAME,
    phase: PACKAGE_PHASE,
    status: PACKAGE_STATUS,
    description: 'Supabase PostgreSQL client, migrations helpers, RLS-aware data access',
  } as const;
}
