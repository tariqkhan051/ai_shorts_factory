/**
 * Package: @ai-shorts-factory/storage
 * Cloudflare R2 abstraction with signed URLs and a memory provider for tests.
 */

export const PACKAGE_NAME = '@ai-shorts-factory/storage' as const;
export const PACKAGE_PHASE = 1 as const;
export const PACKAGE_STATUS = 'active' as const;

export type { StoredObject, PutObjectInput, SignedUrlOptions, ObjectStorage } from './types.js';
export { assertSafeStorageKey, buildReferenceAssetKey } from './types.js';
export { MemoryObjectStorage } from './memory-storage.js';
export { R2ObjectStorage, isR2Configured, type R2StorageConfig } from './r2-storage.js';
export { createObjectStorage, type StorageMode } from './factory.js';
export { buildProjectStoragePrefix, purgeProjectPrefix } from './lifecycle.js';

export function getPackageMeta() {
  return {
    name: PACKAGE_NAME,
    phase: PACKAGE_PHASE,
    status: PACKAGE_STATUS,
    description: 'Cloudflare R2 storage abstraction with signed URLs',
  } as const;
}
