import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  KB_ARTIFACT_SYNC_SCHEMA_VERSION,
  parseKbArtifactSyncManifest,
  kbSyncRunSchema,
  type KbArtifactSyncManifest,
  type KbSyncArtifactResult,
  type KbSyncRun,
} from '@ai-shorts-factory/validation';
import {
  importGameKnowledgeAsDraft,
  previewGameKnowledgeImport,
} from './game-knowledge-import.js';
import type { GameKnowledgeRepository } from './game-knowledge-types.js';
import type { KbSyncRepository } from './kb-sync-types.js';

export type PullKbArtifactsInput = {
  userId: string;
  /** Absolute or relative paths resolved against baseDir. */
  manifest: KbArtifactSyncManifest | unknown;
  knowledge: GameKnowledgeRepository;
  sync: KbSyncRepository;
  /** Directory used to resolve relative artifact paths. */
  baseDir?: string;
  /**
   * When true, still import noop diffs as drafts (legacy M2 behavior).
   * Default false — M7 skips unchanged KB.
   */
  forceReimportNoop?: boolean;
};

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Pull operator-provided local research artifacts into **draft** patches only.
 *
 * - Never publishes / activates knowledge (`auto_publish` is always false).
 * - Never fetches remote Moonton APIs — local files from the manifest only.
 * - Skips unchanged KB (noop vs baseline) and identical already-synced content.
 */
export async function pullKbArtifactsAsDrafts(
  input: PullKbArtifactsInput,
): Promise<KbSyncRun> {
  const startedAt = new Date().toISOString();
  const manifest = parseKbArtifactSyncManifest(input.manifest);
  const results: KbSyncArtifactResult[] = [];
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of manifest.artifacts) {
    const absolutePath = resolve(input.baseDir ?? process.cwd(), entry.path);
    try {
      const raw = await readFile(absolutePath, 'utf8');
      const contentSha = sha256(raw);
      const prior = await input.sync.getChecksum(input.userId, contentSha);

      const preview = await previewGameKnowledgeImport(input.knowledge, input.userId, raw);
      if (!preview.ok) {
        failed += 1;
        results.push({
          path: absolutePath,
          content_sha256: contentSha,
          status: 'failed',
          draft_patch_id: null,
          diff_summary: '',
          is_noop: false,
          error: preview.errors.join('; '),
        });
        continue;
      }

      const alreadySynced =
        prior != null &&
        (prior.last_status === 'imported_draft' || prior.last_status === 'skipped_unchanged');

      if (alreadySynced && !input.forceReimportNoop) {
        skipped += 1;
        results.push({
          path: absolutePath,
          content_sha256: contentSha,
          status: 'skipped_unchanged',
          draft_patch_id: prior.draft_patch_id,
          diff_summary: 'Identical artifact content already synced',
          is_noop: true,
          error: null,
        });
        continue;
      }

      if (preview.diff.is_noop && !input.forceReimportNoop) {
        skipped += 1;
        const draftPatchId = prior?.draft_patch_id ?? preview.baseline_patch?.id ?? null;
        results.push({
          path: absolutePath,
          content_sha256: contentSha,
          status: 'skipped_unchanged',
          draft_patch_id: draftPatchId,
          diff_summary: preview.diff.summary,
          is_noop: true,
          error: null,
        });
        await input.sync.saveChecksum(input.userId, {
          content_sha256: contentSha,
          path: absolutePath,
          last_status: 'skipped_unchanged',
          draft_patch_id: draftPatchId,
          updated_at: new Date().toISOString(),
        });
        continue;
      }

      const importedResult = await importGameKnowledgeAsDraft(
        input.knowledge,
        input.userId,
        raw,
      );
      if (!importedResult.ok) {
        failed += 1;
        results.push({
          path: absolutePath,
          content_sha256: contentSha,
          status: 'failed',
          draft_patch_id: null,
          diff_summary: preview.diff.summary,
          is_noop: preview.diff.is_noop,
          error: importedResult.errors.join('; '),
        });
        continue;
      }

      imported += 1;
      const draftId = importedResult.result.draft_patch.id;
      results.push({
        path: absolutePath,
        content_sha256: contentSha,
        status: 'imported_draft',
        draft_patch_id: draftId,
        diff_summary: importedResult.result.diff.summary,
        is_noop: importedResult.result.diff.is_noop,
        error: null,
      });
      await input.sync.saveChecksum(input.userId, {
        content_sha256: contentSha,
        path: absolutePath,
        last_status: 'imported_draft',
        draft_patch_id: draftId,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      failed += 1;
      results.push({
        path: absolutePath,
        content_sha256: sha256(absolutePath),
        status: 'failed',
        draft_patch_id: null,
        diff_summary: '',
        is_noop: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const run = kbSyncRunSchema.parse({
    schema_version: KB_ARTIFACT_SYNC_SCHEMA_VERSION,
    id: randomUUID(),
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    auto_publish: false,
    results,
    imported_draft_count: imported,
    skipped_unchanged_count: skipped,
    failed_count: failed,
    notes: manifest.notes,
  });

  return input.sync.saveRun(input.userId, run);
}
