import { MemoryObjectStorage } from './memory-storage.js';
import { isR2Configured, R2ObjectStorage } from './r2-storage.js';
import type { ObjectStorage } from './types.js';

export type StorageMode = 'memory' | 'r2';

export function createObjectStorage(env: NodeJS.ProcessEnv = process.env): ObjectStorage {
  const explicit = env.STORAGE_PROVIDER;
  if (explicit === 'memory') {
    return new MemoryObjectStorage({
      defaultTtlSeconds: env.R2_SIGNED_URL_TTL_SECONDS
        ? Number(env.R2_SIGNED_URL_TTL_SECONDS)
        : 3600,
    });
  }
  if (explicit === 'r2' || isR2Configured(env)) {
    return R2ObjectStorage.fromEnv(env);
  }
  return new MemoryObjectStorage();
}
