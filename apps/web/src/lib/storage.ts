import { createObjectStorage, type ObjectStorage } from '@ai-shorts-factory/storage';

const globalForStorage = globalThis as typeof globalThis & {
  __asfStorage?: ObjectStorage;
};

export function getObjectStorage(): ObjectStorage {
  if (!globalForStorage.__asfStorage) {
    globalForStorage.__asfStorage = createObjectStorage(process.env);
  }
  return globalForStorage.__asfStorage;
}
