import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { ObjectStorage, PutObjectInput, SignedUrlOptions, StoredObject } from './types.js';
import { assertSafeStorageKey } from './types.js';
import {
  DEFAULT_MULTIPART_PART_SIZE_BYTES,
  type CompletedUploadPart,
  type HeadObjectResult,
  type MultipartObjectStorage,
  type MultipartUploadSession,
  type SignedUploadPart,
} from './multipart-types.js';

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
export class R2ObjectStorage implements ObjectStorage, MultipartObjectStorage {
  readonly name = 'r2';
  readonly supportsMultipartUpload = true as const;
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

  async listObjectKeys(prefix: string): Promise<string[]> {
    if (prefix) {
      assertSafeStorageKey(prefix.endsWith('/') ? prefix.slice(0, -1) : prefix);
    }
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const item of result.Contents ?? []) {
        if (item.Key) keys.push(item.Key);
      }
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);
    return keys.sort();
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

  async createMultipartUpload(input: {
    key: string;
    contentType: string;
    byteSize: number;
    partSizeBytes?: number;
  }): Promise<MultipartUploadSession> {
    assertSafeStorageKey(input.key);
    if (input.byteSize <= 0) throw new Error('byteSize must be positive');
    const partSizeBytes = input.partSizeBytes ?? DEFAULT_MULTIPART_PART_SIZE_BYTES;
    const partCount = Math.max(1, Math.ceil(input.byteSize / partSizeBytes));
    if (partCount > 10_000) {
      throw new Error('File requires too many parts; increase part size');
    }

    const result = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: input.key,
        ContentType: input.contentType,
      }),
    );
    if (!result.UploadId) throw new Error('R2 CreateMultipartUpload returned no UploadId');

    return {
      key: input.key,
      uploadId: result.UploadId,
      partSizeBytes,
      partCount,
    };
  }

  async createSignedUploadPartUrls(input: {
    key: string;
    uploadId: string;
    partNumbers: number[];
    expiresInSeconds?: number;
  }): Promise<SignedUploadPart[]> {
    assertSafeStorageKey(input.key);
    const expiresInSeconds = input.expiresInSeconds ?? this.defaultTtlSeconds;
    const urls: SignedUploadPart[] = [];
    for (const partNumber of input.partNumbers) {
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
        throw new Error(`Invalid part number: ${partNumber}`);
      }
      const url = await getSignedUrl(
        this.client,
        new UploadPartCommand({
          Bucket: this.bucketName,
          Key: input.key,
          UploadId: input.uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: expiresInSeconds },
      );
      urls.push({ partNumber, url, expiresInSeconds });
    }
    return urls;
  }

  async completeMultipartUpload(input: {
    key: string;
    uploadId: string;
    parts: CompletedUploadPart[];
  }): Promise<HeadObjectResult> {
    assertSafeStorageKey(input.key);
    const parts = [...input.parts].sort((a, b) => a.partNumber - b.partNumber);
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: input.key,
        UploadId: input.uploadId,
        MultipartUpload: {
          Parts: parts.map((part) => ({
            ETag: part.etag,
            PartNumber: part.partNumber,
          })),
        },
      }),
    );
    const head = await this.headObject(input.key);
    if (!head) throw new Error('Upload completed but object head failed');
    return head;
  }

  async abortMultipartUpload(input: { key: string; uploadId: string }): Promise<void> {
    assertSafeStorageKey(input.key);
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: input.key,
        UploadId: input.uploadId,
      }),
    );
  }

  async downloadToFile(
    key: string,
    destinationPath: string,
  ): Promise<{ byteSize: number }> {
    assertSafeStorageKey(key);
    await mkdir(dirname(destinationPath), { recursive: true });
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
    if (!result.Body) throw new Error(`R2 object empty: ${key}`);
    const body = result.Body as Readable;
    await pipeline(body, createWriteStream(destinationPath));
    return { byteSize: Number(result.ContentLength ?? 0) };
  }

  async headObject(key: string): Promise<HeadObjectResult | null> {
    assertSafeStorageKey(key);
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      return {
        key,
        byteSize: Number(result.ContentLength ?? 0),
        contentType: result.ContentType ?? null,
        etag: result.ETag ?? null,
      };
    } catch {
      return null;
    }
  }
}

export function isR2Configured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_NAME,
  );
}
