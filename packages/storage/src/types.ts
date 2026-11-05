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
  listObjectKeys(prefix: string): Promise<string[]>;
  createSignedDownloadUrl(key: string, options?: SignedUrlOptions): Promise<string>;
  createSignedUploadUrl(key: string, options?: SignedUrlOptions): Promise<string>;
  /** Optional: stream object to a local file without buffering the entire object when supported. */
  downloadToFile?(key: string, destinationPath: string): Promise<{ byteSize: number }>;
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
  const baseName = params.filename.split(/[/\\]/).pop() ?? 'asset';
  const safeName = baseName
    .replace(/\.\./g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 120);
  const projectPart = (params.projectId ?? 'library').replace(/[^a-zA-Z0-9_-]/g, '_');
  const userPart = params.userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `users/${userPart}/references/${projectPart}/${Date.now()}-${safeName || 'asset'}`;
}

export function buildMatchStudioRecordingKey(params: {
  userId: string;
  runId: string;
  filename: string;
}): string {
  const baseName = params.filename.split(/[/\\]/).pop() ?? 'recording.mp4';
  const safeName = baseName
    .replace(/\.\./g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 120);
  const userPart = params.userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const runPart = params.runId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `users/${userPart}/match-studio/${runPart}/source/${Date.now()}-${safeName || 'recording.mp4'}`;
}
