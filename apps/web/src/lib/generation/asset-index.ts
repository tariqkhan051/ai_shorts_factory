import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Global content-addressed asset registry (SHA-256).
 *
 * Distinctions:
 * - duplicate file content: same SHA appears again (may reuse immutable object key)
 * - duplicate scene assignment: same SHA assigned to two scenes in one project (rejected)
 * - intentional asset reuse: same SHA referenced from another project without overwriting bytes
 */
export type AssetIndexEntry = {
  sha256: string;
  storageKey: string;
  byteLength: number;
  contentType: string;
  createdAt: string;
  references: Array<{
    projectId: string;
    sceneId: string;
    sceneNumber: number;
    userId: string;
    attachedAt: string;
  }>;
};

type AssetIndexFile = {
  version: 1;
  assets: AssetIndexEntry[];
};

function indexPath(): string {
  return (
    process.env.ASF_ASSET_INDEX_PATH?.trim() ||
    join(process.cwd(), '.data', 'asset-index.json')
  );
}

async function readIndex(): Promise<AssetIndexFile> {
  try {
    const raw = await readFile(indexPath(), 'utf8');
    const parsed = JSON.parse(raw) as AssetIndexFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.assets)) {
      return { version: 1, assets: [] };
    }
    return parsed;
  } catch {
    return { version: 1, assets: [] };
  }
}

async function writeIndexAtomic(index: AssetIndexFile): Promise<void> {
  const path = indexPath();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}

export async function getAssetBySha(sha256: string): Promise<AssetIndexEntry | null> {
  const index = await readIndex();
  const found = index.assets.find((asset) => asset.sha256 === sha256);
  return found ? structuredClone(found) : null;
}

export async function registerOrReuseAsset(input: {
  sha256: string;
  storageKey: string;
  byteLength: number;
  contentType: string;
  userId: string;
  projectId: string;
  sceneId: string;
  sceneNumber: number;
}): Promise<{ entry: AssetIndexEntry; reusedExistingObject: boolean }> {
  const index = await readIndex();
  const existing = index.assets.find((asset) => asset.sha256 === input.sha256);
  const now = new Date().toISOString();

  if (existing) {
    const already = existing.references.some(
      (ref) => ref.projectId === input.projectId && ref.sceneId === input.sceneId,
    );
    if (!already) {
      existing.references.push({
        projectId: input.projectId,
        sceneId: input.sceneId,
        sceneNumber: input.sceneNumber,
        userId: input.userId,
        attachedAt: now,
      });
    }
    await writeIndexAtomic(index);
    return { entry: structuredClone(existing), reusedExistingObject: true };
  }

  const entry: AssetIndexEntry = {
    sha256: input.sha256,
    storageKey: input.storageKey,
    byteLength: input.byteLength,
    contentType: input.contentType,
    createdAt: now,
    references: [
      {
        projectId: input.projectId,
        sceneId: input.sceneId,
        sceneNumber: input.sceneNumber,
        userId: input.userId,
        attachedAt: now,
      },
    ],
  };
  index.assets.push(entry);
  await writeIndexAtomic(index);
  return { entry: structuredClone(entry), reusedExistingObject: false };
}

export async function findCrossProjectDuplicate(
  sha256: string,
  projectId: string,
): Promise<AssetIndexEntry | null> {
  const entry = await getAssetBySha(sha256);
  if (!entry) return null;
  const other = entry.references.some((ref) => ref.projectId !== projectId);
  return other ? entry : null;
}
