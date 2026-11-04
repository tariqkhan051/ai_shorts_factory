import { describe, expect, it, beforeEach } from 'vitest';
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
});
