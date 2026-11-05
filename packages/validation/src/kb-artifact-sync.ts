import { z } from 'zod';
import {
  GAME_SERVER_ENVIRONMENTS,
  KB_SYNC_RUN_STATUSES,
} from '@ai-shorts-factory/shared-types';

export const KB_ARTIFACT_SYNC_SCHEMA_VERSION = 'kb-artifact-sync-v1' as const;

export const kbArtifactManifestEntrySchema = z.object({
  /** Relative or absolute path to a game-knowledge-import-v1 JSON file. */
  path: z.string().trim().min(1).max(2048),
  /** Optional operator label. */
  label: z.string().trim().max(200).optional(),
  server_environment: z.enum(GAME_SERVER_ENVIRONMENTS).optional(),
});

/**
 * Operator-provided sync manifest. Lists local research artifact files only —
 * no remote Moonton API URLs.
 */
export const kbArtifactSyncManifestSchema = z.object({
  schema_version: z.literal(KB_ARTIFACT_SYNC_SCHEMA_VERSION),
  /** Watch / inbox directory hint (informational). */
  inbox_dir: z.string().trim().min(1).max(2048).optional(),
  artifacts: z.array(kbArtifactManifestEntrySchema).min(1).max(100),
  notes: z.string().trim().max(4000).default(''),
});

export const kbSyncArtifactResultSchema = z.object({
  path: z.string(),
  content_sha256: z.string().length(64),
  status: z.enum(KB_SYNC_RUN_STATUSES),
  draft_patch_id: z.string().uuid().nullable().default(null),
  diff_summary: z.string().max(2000).default(''),
  is_noop: z.boolean().default(false),
  error: z.string().max(4000).nullable().default(null),
});

export const kbSyncRunSchema = z.object({
  schema_version: z.literal(KB_ARTIFACT_SYNC_SCHEMA_VERSION),
  id: z.string().uuid(),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  auto_publish: z.literal(false),
  results: z.array(kbSyncArtifactResultSchema).max(100),
  imported_draft_count: z.number().int().min(0),
  skipped_unchanged_count: z.number().int().min(0),
  failed_count: z.number().int().min(0),
  notes: z.string().trim().max(4000).default(''),
});

export type KbArtifactManifestEntry = z.infer<typeof kbArtifactManifestEntrySchema>;
export type KbArtifactSyncManifest = z.infer<typeof kbArtifactSyncManifestSchema>;
export type KbSyncArtifactResult = z.infer<typeof kbSyncArtifactResultSchema>;
export type KbSyncRun = z.infer<typeof kbSyncRunSchema>;

export function parseKbArtifactSyncManifest(input: unknown): KbArtifactSyncManifest {
  return kbArtifactSyncManifestSchema.parse(input);
}

export function safeParseKbArtifactSyncManifest(input: unknown) {
  return kbArtifactSyncManifestSchema.safeParse(input);
}

export function parseKbSyncRun(input: unknown): KbSyncRun {
  return kbSyncRunSchema.parse(input);
}
