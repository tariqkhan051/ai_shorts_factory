import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ObjectStorage, PutObjectInput, SignedUrlOptions, StoredObject } from './types.js';
import { assertSafeStorageKey } from './types.js';

/**
 * Durable local object storage under `.data/objects`.
 * Drop-in for memory mode so mock scene assets and finals survive process restart.
 * Cloud deployments should prefer R2 via STORAGE_PROVIDER=r2.
 */
export class LocalFileObjectStorage implements ObjectStorage {
  readonly name = 'local-file';
  private readonly rootDir: string;
  private readonly defaultTtlSeconds: number;
  private readonly tokens = new Map<
    string,
    { key: string; expiresAt: number; mode: 'download' | 'upload' }
  >();

  constructor(options?: { rootDir?: string; defaultTtlSeconds?: number }) {
    this.rootDir =
      options?.rootDir ??
      process.env.ASF_OBJECT_DIR?.trim() ??
      join(process.cwd(), '.data', 'objects');
    this.defaultTtlSeconds = options?.defaultTtlSeconds ?? 3600;
  }

  private objectPath(key: string): string {
    assertSafeStorageKey(key);
    return join(this.rootDir, key);
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const path = this.objectPath(input.key);
    await mkdir(dirname(path), { recursive: true });
    const body = Buffer.from(input.body);
    const checksumSha256 = input.checksumSha256 ?? createHash('sha256').update(body).digest('hex');
    await writeFile(path, body);
    await writeFile(
      `${path}.meta.json`,
      JSON.stringify({
        contentType: input.contentType,
        checksumSha256,
        byteSize: body.byteLength,
      }),
      'utf8',
    );
    return {
      key: input.key,
      contentType: input.contentType,
      byteSize: body.byteLength,
      checksumSha256,
    };
  }

  async getObject(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    try {
      const path = this.objectPath(key);
      const body = await readFile(path);
      let contentType = 'application/octet-stream';
      try {
        const meta = JSON.parse(await readFile(`${path}.meta.json`, 'utf8')) as {
          contentType?: string;
        };
        contentType = meta.contentType ?? contentType;
      } catch {
        // meta optional
      }
      return { body, contentType };
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const path = this.objectPath(key);
    await rm(path, { force: true });
    await rm(`${path}.meta.json`, { force: true });
  }

  async listObjectKeys(prefix: string): Promise<string[]> {
    if (prefix) {
      assertSafeStorageKey(prefix.endsWith('/') ? prefix.slice(0, -1) : prefix);
    }
    const keys: string[] = [];
    await this.walk(this.rootDir, '', prefix, keys);
    return keys.sort();
  }

  async createSignedDownloadUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    assertSafeStorageKey(key);
    const existing = await this.getObject(key);
    if (!existing) {
      throw new Error(`Object not found: ${key}`);
    }
    return this.createToken(key, 'download', options?.expiresInSeconds);
  }

  async createSignedUploadUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    assertSafeStorageKey(key);
    return this.createToken(key, 'upload', options?.expiresInSeconds);
  }

  async downloadToFile(
    key: string,
    destinationPath: string,
  ): Promise<{ byteSize: number }> {
    const source = this.objectPath(key);
    await mkdir(dirname(destinationPath), { recursive: true });
    await copyFile(source, destinationPath);
    const info = await stat(destinationPath);
    return { byteSize: info.size };
  }

  private async walk(
    absDir: string,
    rel: string,
    prefix: string,
    out: string[],
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(abs, nextRel, prefix, out);
        continue;
      }
      if (entry.name.endsWith('.meta.json')) continue;
      if (!prefix || nextRel.startsWith(prefix)) {
        out.push(nextRel);
      }
    }
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
    return `local-file://${token}`;
  }
}
