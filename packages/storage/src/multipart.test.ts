import { describe, expect, it } from 'vitest';
import { buildMatchStudioRecordingKey } from './types.js';
import {
  DEFAULT_MULTIPART_PART_SIZE_BYTES,
  isMultipartObjectStorage,
  SUPABASE_FREE_MAX_UPLOAD_BYTES,
} from './multipart-types.js';
import { R2ObjectStorage } from './r2-storage.js';
import { MemoryObjectStorage } from './memory-storage.js';

describe('Match Studio multipart helpers', () => {
  it('builds run-scoped storage keys without path traversal', () => {
    const key = buildMatchStudioRecordingKey({
      userId: 'user-1',
      runId: 'run-1',
      filename: '..\\evil/match.mp4',
    });
    expect(key.startsWith('users/user-1/match-studio/run-1/source/')).toBe(true);
    expect(key.includes('..')).toBe(false);
  });

  it('detects multipart capability on R2 class shape', () => {
    expect(isMultipartObjectStorage(new MemoryObjectStorage())).toBe(false);
    // Construct without env — only checks the capability flag via prototype instance mock.
    const fake = {
      supportsMultipartUpload: true as const,
    };
    expect(isMultipartObjectStorage(fake)).toBe(true);
    expect(SUPABASE_FREE_MAX_UPLOAD_BYTES).toBe(50 * 1024 * 1024);
    expect(DEFAULT_MULTIPART_PART_SIZE_BYTES).toBe(16 * 1024 * 1024);
    const r2 = new R2ObjectStorage({
      accountId: 'a',
      accessKeyId: 'b',
      secretAccessKey: 'c',
      bucketName: 'd',
    });
    expect(isMultipartObjectStorage(r2)).toBe(true);
  });
});
