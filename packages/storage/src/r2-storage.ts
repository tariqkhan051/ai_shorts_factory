import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import type { ObjectStorage, PutObjectInput, SignedUrlOptions, StoredObject } from './types.js';
import { assertSafeStorageKey } from './types.js';

export type R2StorageConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  signedUrlTtlSeconds?: number;
};

/**
 * Cloudflare R2 via S3-compatible API.
 * Credentials must remain server-side only.
 */
export class R2ObjectStorage implements ObjectStorage {
  readonly name = 'r2';
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly defaultTtlSeconds: number;

  constructor(config: R2StorageConfig) {
    this.bucketName = config.bucketName;
    this.defaultTtlSeconds = config.signedUrlTtlSeconds ?? 3600;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): R2ObjectStorage {
    const accountId = env.R2_ACCOUNT_ID;
    const accessKeyId = env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
    const bucketName = env.R2_BUCKET_NAME;
    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      throw new Error('R2 is not fully configured');
    }
    return new R2ObjectStorage({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      signedUrlTtlSeconds: env.R2_SIGNED_URL_TTL_SECONDS
        ? Number(env.R2_SIGNED_URL_TTL_SECONDS)
        : 3600,
    });
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    assertSafeStorageKey(input.key);
    const body = Buffer.from(input.body);
    const checksumSha256 = input.checksumSha256 ?? createHash('sha256').update(body).digest('hex');

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: input.key,
        Body: body,
        ContentType: input.contentType,
        Metadata: { checksumSha256 },
      }),
    );

    return {
      key: input.key,
      contentType: input.contentType,
      byteSize: body.byteLength,
      checksumSha256,
    };
  }

  async getObject(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    assertSafeStorageKey(key);
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes) return null;
      return {
        body: Buffer.from(bytes),
        contentType: result.ContentType ?? 'application/octet-stream',
      };
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    assertSafeStorageKey(key);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
  }

  async createSignedDownloadUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    assertSafeStorageKey(key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ResponseContentType: options?.contentType,
      }),
      { expiresIn: options?.expiresInSeconds ?? this.defaultTtlSeconds },
    );
  }

  async createSignedUploadUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    assertSafeStorageKey(key);
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: options?.contentType,
      }),
      { expiresIn: options?.expiresInSeconds ?? this.defaultTtlSeconds },
    );
  }
}

export function isR2Configured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_NAME,
  );
}
