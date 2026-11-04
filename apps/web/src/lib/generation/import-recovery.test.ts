import { describe, expect, it } from 'vitest';
import {
  createImportOperation,
  findCompletedImportBySha,
  updateImportOperation,
  withSceneImportLock,
} from './import-operation-store.js';
import { getAssetBySha, registerOrReuseAsset } from './asset-index.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('import recovery primitives', () => {
  it('records import ops and recovers completed sha lookups', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'asf-import-ops-'));
    process.env.ASF_IMPORT_OPS_DIR = dir;
    try {
      const op = await createImportOperation({
        userId: 'u1',
        projectId: 'p1',
        sceneId: 's1',
        sceneNumber: 1,
        sha256: 'abc123',
        byteLength: 10,
      });
      expect(op.status).toBe('started');
      await updateImportOperation(op.id, {
        status: 'stored',
        storageKey: 'projects/p1/scenes/1/original.mp4',
      });
      await updateImportOperation(op.id, { status: 'completed' });
      const found = await findCompletedImportBySha('p1', 's1', 'abc123');
      expect(found?.storageKey).toContain('original.mp4');
    } finally {
      await rm(dir, { recursive: true, force: true });
      delete process.env.ASF_IMPORT_OPS_DIR;
    }
  });

  it('serializes concurrent scene import locks', async () => {
    const order: number[] = [];
    await Promise.all([
      withSceneImportLock('p1', 's1', async () => {
        order.push(1);
        await new Promise((r) => setTimeout(r, 30));
        order.push(2);
      }),
      withSceneImportLock('p1', 's1', async () => {
        order.push(3);
      }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('reuses immutable asset content across projects without overwrite', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'asf-asset-idx-'));
    process.env.ASF_ASSET_INDEX_PATH = join(dir, 'index.json');
    try {
      const first = await registerOrReuseAsset({
        sha256: 'deadbeef',
        storageKey: 'projects/p1/scenes/1/original-deadbeef.mp4',
        byteLength: 100,
        contentType: 'video/mp4',
        userId: 'u1',
        projectId: 'p1',
        sceneId: 's1',
        sceneNumber: 1,
      });
      expect(first.reusedExistingObject).toBe(false);
      const second = await registerOrReuseAsset({
        sha256: 'deadbeef',
        storageKey: 'projects/p2/scenes/1/original-deadbeef.mp4',
        byteLength: 100,
        contentType: 'video/mp4',
        userId: 'u1',
        projectId: 'p2',
        sceneId: 's9',
        sceneNumber: 1,
      });
      expect(second.reusedExistingObject).toBe(true);
      expect(second.entry.storageKey).toBe(first.entry.storageKey);
      const loaded = await getAssetBySha('deadbeef');
      expect(loaded?.references).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
      delete process.env.ASF_ASSET_INDEX_PATH;
    }
  });
});
