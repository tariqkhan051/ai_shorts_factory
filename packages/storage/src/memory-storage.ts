import { createHash, randomUUID } from 'node:crypto';
import type { ObjectStorage, PutObjectInput, SignedUrlOptions, StoredObject } from './types.js';
import { assertSafeStorageKey } from './types.js';

type MemoryObject = {
  body: Buffer;
  contentType: string;
  checksumSha256?: string;
};

/**
 * In-memory object storage for tests and local development.
 * Signed URLs are opaque tokens resolved only inside this process.
 */
export class MemoryObjectStorage implements ObjectStorage {
  readonly name = 'memory';
  private readonly objects = new Map<string, MemoryObject>();
  private readonly tokens = new Map<
    string,
    { key: string; expiresAt: number; mode: 'download' | 'upload' }
  >();
  private readonly defaultTtlSeconds: number;

  constructor(options?: { defaultTtlSeconds?: number }) {
    this.defaultTtlSeconds = options?.defaultTtlSeconds ?? 3600;
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    assertSafeStorageKey(input.key);
    const body = Buffer.from(input.body);
    const checksumSha256 = input.checksumSha256 ?? createHash('sha256').update(body).digest('hex');
    this.objects.set(input.key, {
      body,
      contentType: input.contentType,
      checksumSha256,
    });
    return {
      key: input.key,
      contentType: input.contentType,
      byteSize: body.byteLength,
      checksumSha256,
    };
  }

  async getObject(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    assertSafeStorageKey(key);
    const object = this.objects.get(key);
    if (!object) return null;
    return { body: Buffer.from(object.body), contentType: object.contentType };
  }

  async deleteObject(key: string): Promise<void> {
    assertSafeStorageKey(key);
    this.objects.delete(key);
  }

  async createSignedDownloadUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    assertSafeStorageKey(key);
    if (!this.objects.has(key)) {
      throw new Error(`Object not found: ${key}`);
    }
    return this.createToken(key, 'download', options?.expiresInSeconds);
  }

  async createSignedUploadUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    assertSafeStorageKey(key);
    return this.createToken(key, 'upload', options?.expiresInSeconds);
  }

  resolveSignedUrl(url: string): { key: string; mode: 'download' | 'upload' } | null {
    const token = url.replace(/^memory:\/\//, '');
    const entry = this.tokens.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.tokens.delete(token);
      return null;
    }
    return { key: entry.key, mode: entry.mode };
  }

  clear(): void {
    this.objects.clear();
    this.tokens.clear();
  }

  private createToken(
    key: string,
    mode: 'download' | 'upload',
    expiresInSeconds = this.defaultTtlSeconds,
  ): string {
    const token = randomUUID();
    this.tokens.set(token, {
      key,
      mode,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    });
    return `memory://${token}`;
  }
}
