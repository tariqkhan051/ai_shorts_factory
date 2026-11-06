/**
 * Package: @ai-shorts-factory/knowledge-engine
 * Autonomous MLBB Knowledge Engine — discovery, ingestion, validation, scheduling.
 */

export const PACKAGE_NAME = '@ai-shorts-factory/knowledge-engine' as const;

export type * from './types.js';
export {
  AutonomousMlbbKnowledgeEngine,
  type AutonomousEngineOptions,
} from './engine/autonomous-engine.js';
export { runKnowledgeEngineSchedulerLoop, type KnowledgeEngineSchedulerOptions } from './engine/scheduler.js';
export {
  MemoryKnowledgeEngineStore,
  type MemoryEngineSnapshot,
} from './store/memory-engine-store.js';
export { createDefaultMonitoredSources } from './sources/registry.js';
export { PoliteFetchClient } from './http/fetch-client.js';
export { isUrlAllowedByRobots, clearRobotsCache } from './http/robots.js';
export { parseFandomHeroHtml } from './parsers/fandom-hero-html.js';
export { summarizePatchNotes, isFormattingOnlyChange } from './parsers/patch-notes.js';
export {
  createDefaultExtractionProvider,
  DeterministicExtractionProvider,
  NoopAiExtractionProvider,
  type KnowledgeExtractionProvider,
} from './extraction/provider.js';
export {
  validateExtractedHero,
  validatePatchSummary,
  detectHeroContradiction,
} from './validation/record-validator.js';
export {
  buildMatchKnowledgeContextPackage,
  type BuildMatchKnowledgeContextInput,
} from './match/context-package.js';
export { sha256, toSnakeKey, nowIso } from './util.js';
