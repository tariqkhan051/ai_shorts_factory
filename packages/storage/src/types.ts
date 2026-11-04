export type StoredObject = {
  key: string;
  contentType: string;
  byteSize: number;
  checksumSha256?: string;
};

export type PutObjectInput = {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  checksumSha256?: string;
};

export type SignedUrlOptions = {
  expiresInSeconds?: number;
  contentType?: string;
};

export interface ObjectStorage {
  readonly name: string;
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getObject(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  deleteObject(key: string): Promise<void>;
  createSignedDownloadUrl(key: string, options?: SignedUrlOptions): Promise<string>;
  createSignedUploadUrl(key: string, options?: SignedUrlOptions): Promise<string>;
}

export function assertSafeStorageKey(key: string): void {
  if (!key || key.includes('..') || key.startsWith('/') || key.includes('\\')) {
    throw new Error('Invalid storage key');
  }
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(key)) {
    throw new Error('Storage key contains unsupported characters');
  }
}

export function buildReferenceAssetKey(params: {
  userId: string;
  projectId?: string;
  filename: string;
}): string {
  const safeName = params.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const projectPart = params.projectId ?? 'library';
  return `users/${params.userId}/references/${projectPart}/${Date.now()}-${safeName}`;
}
