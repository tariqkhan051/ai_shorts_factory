import type { ObjectStorage } from './types.js';
import { assertSafeStorageKey } from './types.js';

export function buildProjectStoragePrefix(userId: string, projectId: string): string {
  const userPart = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const projectPart = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `users/${userPart}/projects/${projectPart}/`;
}

/**
 * Deletes every object under a project prefix (scenes, finals, diagnostics).
 * Intended for soft-deleted projects and orphan cleanup jobs.
 */
export async function purgeProjectPrefix(
  storage: ObjectStorage,
  userId: string,
  projectId: string,
): Promise<{ deletedKeys: string[] }> {
  const prefix = buildProjectStoragePrefix(userId, projectId);
  assertSafeStorageKey(prefix.slice(0, -1));
  const keys = await storage.listObjectKeys(prefix);
  for (const key of keys) {
    await storage.deleteObject(key);
  }
  return { deletedKeys: keys };
}
