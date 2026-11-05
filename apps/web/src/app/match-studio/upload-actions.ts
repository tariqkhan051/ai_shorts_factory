'use server';

import { revalidatePath } from 'next/cache';
import {
  assertStorageKeyBelongsToRun,
  attachRecordingToMatchStudioRun,
  buildMatchStudioStorageKeyPrefix,
  ingestMatchVideo,
  transitionMatchStudioRun,
} from '@ai-shorts-factory/database';
import {
  buildMatchStudioRecordingKey,
  createObjectStorage,
  isMultipartObjectStorage,
  isR2Configured,
  type CompletedUploadPart,
} from '@ai-shorts-factory/storage';
import { requireUser } from '@/lib/auth';
import { getGameKnowledgeRepository } from '@/lib/projects/repository';
import {
  getMatchAnalysisRepository,
  getMatchJobQueue,
  getMatchStudioRepository,
} from '@/lib/match-studio/runtime';

export type MatchUploadSessionResult =
  | {
      ok: true;
      provider: 'r2';
      key: string;
      uploadId: string;
      partSizeBytes: number;
      partCount: number;
    }
  | { ok: false; message: string; cloudUploadAvailable: boolean };

export type MatchUploadPartsResult =
  | { ok: true; parts: Array<{ partNumber: number; url: string; expiresInSeconds: number }> }
  | { ok: false; message: string };

export type MatchUploadCompleteResult =
  | { ok: true; message: string; runId: string; storageKey: string; byteSize: number }
  | { ok: false; message: string; errors?: string[] };

function getMultipartStorage() {
  if (!isR2Configured(process.env) && process.env.STORAGE_PROVIDER !== 'r2') {
    return null;
  }
  const storage = createObjectStorage(process.env);
  if (!isMultipartObjectStorage(storage)) return null;
  return storage;
}

export async function getMatchUploadCapabilityAction(): Promise<{
  cloudUploadAvailable: boolean;
  provider: string;
  hint: string;
}> {
  const multipart = getMultipartStorage();
  if (multipart) {
    return {
      cloudUploadAvailable: true,
      provider: 'r2',
      hint: 'Browser multipart upload to R2 is available. Object must be verified before ingest.',
    };
  }
  return {
    cloudUploadAvailable: false,
    provider: process.env.STORAGE_PROVIDER ?? 'local',
    hint: 'R2 is not configured. Use local path registration — this is not browser cloud upload. Set STORAGE_PROVIDER=r2 and R2_* credentials for multi-GB browser uploads. Supabase Free Storage (50 MB max) is not used for match recordings.',
  };
}

export async function createMatchRecordingUploadSessionAction(input: {
  runId: string;
  filename: string;
  contentType: string;
  byteSize: number;
}): Promise<MatchUploadSessionResult> {
  try {
    const user = await requireUser();
    const studio = await getMatchStudioRepository();
    const run = await studio.getRun(user.id, input.runId);
    if (!run) return { ok: false, message: 'Run not found', cloudUploadAvailable: false };

    const storage = getMultipartStorage();
    if (!storage) {
      return {
        ok: false,
        message:
          'Cloud multipart upload requires R2. Configure R2 or use local path registration.',
        cloudUploadAvailable: false,
      };
    }

    if (!input.byteSize || input.byteSize <= 0) {
      return { ok: false, message: 'Invalid file size', cloudUploadAvailable: true };
    }
    if (!/\.(mp4|mkv|webm|mov)$/i.test(input.filename)) {
      return {
        ok: false,
        message: 'Unsupported extension. Use mp4, mkv, webm, or mov.',
        cloudUploadAvailable: true,
      };
    }

    const key = buildMatchStudioRecordingKey({
      userId: user.id,
      runId: run.id,
      filename: input.filename,
    });
    assertStorageKeyBelongsToRun(key, user.id, run.id);

    const session = await storage.createMultipartUpload({
      key,
      contentType: input.contentType || 'video/mp4',
      byteSize: input.byteSize,
    });

    return {
      ok: true,
      provider: 'r2',
      key: session.key,
      uploadId: session.uploadId,
      partSizeBytes: session.partSizeBytes,
      partCount: session.partCount,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to create upload session',
      cloudUploadAvailable: Boolean(getMultipartStorage()),
    };
  }
}

export async function signMatchRecordingUploadPartsAction(input: {
  runId: string;
  key: string;
  uploadId: string;
  partNumbers: number[];
}): Promise<MatchUploadPartsResult> {
  try {
    const user = await requireUser();
    assertStorageKeyBelongsToRun(input.key, user.id, input.runId);
    if (!input.key.startsWith(buildMatchStudioStorageKeyPrefix(user.id, input.runId))) {
      return { ok: false, message: 'Unauthorized storage key' };
    }

    const storage = getMultipartStorage();
    if (!storage) return { ok: false, message: 'R2 multipart storage unavailable' };

    const parts = await storage.createSignedUploadPartUrls({
      key: input.key,
      uploadId: input.uploadId,
      partNumbers: input.partNumbers,
      expiresInSeconds: 3600,
    });
    return { ok: true, parts };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to sign upload parts',
    };
  }
}

export async function completeMatchRecordingUploadAction(input: {
  runId: string;
  key: string;
  uploadId: string;
  parts: CompletedUploadPart[];
  originalFilename: string;
  expectedByteSize: number;
}): Promise<MatchUploadCompleteResult> {
  try {
    const user = await requireUser();
    const studio = await getMatchStudioRepository();
    const analysis = await getMatchAnalysisRepository();
    const knowledge = await getGameKnowledgeRepository();
    const run = await studio.getRun(user.id, input.runId);
    if (!run) return { ok: false, message: 'Run not found' };

    assertStorageKeyBelongsToRun(input.key, user.id, run.id);

    const storage = getMultipartStorage();
    if (!storage) return { ok: false, message: 'R2 multipart storage unavailable' };

    const head = await storage.completeMultipartUpload({
      key: input.key,
      uploadId: input.uploadId,
      parts: input.parts,
    });

    if (head.byteSize <= 0) {
      return { ok: false, message: 'Upload verification failed: empty object' };
    }
    if (
      input.expectedByteSize > 0 &&
      Math.abs(head.byteSize - input.expectedByteSize) > 1024
    ) {
      return {
        ok: false,
        message: `Upload size mismatch (expected ~${input.expectedByteSize}, got ${head.byteSize})`,
      };
    }

    // Cloud object registered; probe may run on worker with shared storage download (M9.5).
    const source = await ingestMatchVideo(analysis, knowledge, user.id, {
      title: run.title,
      local_path: '',
      storage_key: input.key,
      server_environment: run.server_environment,
      game_patch_id: run.game_patch_id,
      project_id: run.project_id,
      byte_size: head.byteSize,
      ingest_status: 'uploaded',
      original_filename: input.originalFilename,
      probe_json: {
        uploadVerified: true,
        contentType: head.contentType,
        etag: head.etag,
      },
    });

    await attachRecordingToMatchStudioRun({ studio, analysis }, user.id, run.id, source.id);
    await transitionMatchStudioRun(studio, user.id, run.id, 'ready_for_analysis');

    await (await getMatchJobQueue()).enqueue({
      projectId: run.project_id,
      userId: user.id,
      jobType: 'MATCH_INGEST_PROBE',
      idempotencyKey: `match-ingest:${source.id}:${head.etag ?? head.byteSize}`,
      payload: {
        matchStudioRunId: run.id,
        matchSourceId: source.id,
        storageKey: input.key,
      },
    });

    revalidatePath(`/match-studio/${run.id}`);
    return {
      ok: true,
      message: 'Upload verified and recording registered',
      runId: run.id,
      storageKey: input.key,
      byteSize: head.byteSize,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to complete upload',
    };
  }
}

export async function abortMatchRecordingUploadAction(input: {
  runId: string;
  key: string;
  uploadId: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireUser();
    assertStorageKeyBelongsToRun(input.key, user.id, input.runId);
    const storage = getMultipartStorage();
    if (!storage) return { ok: false, message: 'R2 unavailable' };
    await storage.abortMultipartUpload({ key: input.key, uploadId: input.uploadId });
    return { ok: true, message: 'Upload aborted' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Abort failed',
    };
  }
}
