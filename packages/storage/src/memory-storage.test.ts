import { describe, expect, it, beforeEach } from 'vitest';
import { purgeProjectPrefix } from './lifecycle.js';
import { MemoryObjectStorage } from './memory-storage.js';
import { assertSafeStorageKey, buildReferenceAssetKey } from './types.js';

describe('MemoryObjectStorage', () => {
  const storage = new MemoryObjectStorage({ defaultTtlSeconds: 60 });

  beforeEach(() => {
    storage.clear();
  });

  it('stores and signs objects', async () => {
    const put = await storage.putObject({
      key: 'users/u1/references/p1/demo.png',
      body: Buffer.from('hello'),
      contentType: 'image/png',
    });
    expect(put.byteSize).toBe(5);
    expect(put.checksumSha256).toHaveLength(64);

    const signed = await storage.createSignedDownloadUrl(put.key);
    expect(signed.startsWith('memory://')).toBe(true);
    expect(storage.resolveSignedUrl(signed)?.key).toBe(put.key);

    const loaded = await storage.getObject(put.key);
    expect(loaded?.body.toString('utf8')).toBe('hello');
  });

  it('rejects unsafe keys', () => {
    expect(() => assertSafeStorageKey('../etc/passwd')).toThrow(/Invalid/);
  });

  it('builds reference keys without path traversal', () => {
    const key = buildReferenceAssetKey({
      userId: 'user-1',
      projectId: 'project-1',
      filename: '../../evil.png',
    });
    expect(key.includes('..')).toBe(false);
    expect(key.startsWith('users/user-1/references/project-1/')).toBe(true);
  });

  it('purges all objects under a project prefix', async () => {
    await storage.putObject({
      key: 'users/u1/projects/p1/scenes/1.mp4',
      body: Buffer.from('a'),
      contentType: 'video/mp4',
    });
    await storage.putObject({
      key: 'users/u1/projects/p1/final/out.mp4',
      body: Buffer.from('b'),
      contentType: 'video/mp4',
    });
    await storage.putObject({
      key: 'users/u1/projects/p2/final/out.mp4',
      body: Buffer.from('c'),
      contentType: 'video/mp4',
    });

    const result = await purgeProjectPrefix(storage, 'u1', 'p1');
    expect(result.deletedKeys).toHaveLength(2);
    expect(await storage.getObject('users/u1/projects/p1/final/out.mp4')).toBeNull();
    expect(await storage.getObject('users/u1/projects/p2/final/out.mp4')).not.toBeNull();
  });
});
