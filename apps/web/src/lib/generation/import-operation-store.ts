import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type ImportOperationStatus =
  | 'started'
  | 'stored'
  | 'verified'
  | 'completed'
  | 'failed'
  | 'replaced';

export type ImportOperationRecord = {
  id: string;
  userId: string;
  projectId: string;
  sceneId: string;
  sceneNumber: number;
  sha256: string;
  byteLength: number;
  status: ImportOperationStatus;
  storageKey?: string;
  errorMessage?: string;
  allowReplace?: boolean;
  previousStorageKey?: string;
  createdAt: string;
  updatedAt: string;
};

type ImportIndex = {
  version: 1;
  operations: ImportOperationRecord[];
};

function rootDir(): string {
  return process.env.ASF_IMPORT_OPS_DIR?.trim() || join(process.cwd(), '.data', 'import-ops');
}

function indexPath(): string {
  return join(rootDir(), 'operations.json');
}

async function readIndex(): Promise<ImportIndex> {
  try {
    const raw = await readFile(indexPath(), 'utf8');
    const parsed = JSON.parse(raw) as ImportIndex;
    if (parsed.version !== 1 || !Array.isArray(parsed.operations)) {
      return { version: 1, operations: [] };
    }
    return parsed;
  } catch {
    return { version: 1, operations: [] };
  }
}

async function writeIndexAtomic(index: ImportIndex): Promise<void> {
  const path = indexPath();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}

export async function createImportOperation(
  input: Omit<ImportOperationRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'> & {
    status?: ImportOperationStatus;
  },
): Promise<ImportOperationRecord> {
  const now = new Date().toISOString();
  const record: ImportOperationRecord = {
    id: randomUUID(),
    userId: input.userId,
    projectId: input.projectId,
    sceneId: input.sceneId,
    sceneNumber: input.sceneNumber,
    sha256: input.sha256,
    byteLength: input.byteLength,
    status: input.status ?? 'started',
    storageKey: input.storageKey,
    errorMessage: input.errorMessage,
    allowReplace: input.allowReplace,
    previousStorageKey: input.previousStorageKey,
    createdAt: now,
    updatedAt: now,
  };
  const index = await readIndex();
  index.operations.push(record);
  await writeIndexAtomic(index);
  return structuredClone(record);
}

export async function updateImportOperation(
  id: string,
  patch: Partial<ImportOperationRecord>,
): Promise<ImportOperationRecord> {
  const index = await readIndex();
  const idx = index.operations.findIndex((op) => op.id === id);
  if (idx < 0) {
    throw new Error(`Import operation not found: ${id}`);
  }
  const current = index.operations[idx]!;
  const updated: ImportOperationRecord = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };
  index.operations[idx] = updated;
  await writeIndexAtomic(index);
  return structuredClone(updated);
}

export async function findCompletedImportBySha(
  projectId: string,
  sceneId: string,
  sha256: string,
): Promise<ImportOperationRecord | null> {
  const index = await readIndex();
  const matches = index.operations
    .filter(
      (op) =>
        op.projectId === projectId &&
        op.sceneId === sceneId &&
        op.sha256 === sha256 &&
        op.status === 'completed',
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return matches[0] ? structuredClone(matches[0]) : null;
}

export async function listIncompleteImports(): Promise<ImportOperationRecord[]> {
  const index = await readIndex();
  return index.operations
    .filter((op) => op.status === 'started' || op.status === 'stored' || op.status === 'verified')
    .map((op) => structuredClone(op));
}

export async function listOrphanStoredImports(): Promise<ImportOperationRecord[]> {
  const index = await readIndex();
  return index.operations
    .filter((op) => op.status === 'stored' && Boolean(op.storageKey))
    .map((op) => structuredClone(op));
}

/** In-process mutex per project+scene to prevent concurrent imports. */
const locks = new Map<string, Promise<void>>();

export async function withSceneImportLock<T>(
  projectId: string,
  sceneId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = `${projectId}:${sceneId}`;
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => gate);
  locks.set(
    key,
    chained.catch(() => undefined).then(() => undefined),
  );
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === chained) {
      locks.delete(key);
    }
  }
}
