export type MultipartUploadSession = {
  key: string;
  uploadId: string;
  partSizeBytes: number;
  partCount: number;
};

export type SignedUploadPart = {
  partNumber: number;
  url: string;
  expiresInSeconds: number;
};

export type CompletedUploadPart = {
  partNumber: number;
  etag: string;
};

export type HeadObjectResult = {
  key: string;
  byteSize: number;
  contentType: string | null;
  etag: string | null;
};

/**
 * Optional capability for providers that support S3-style multipart uploads (R2).
 */
export interface MultipartObjectStorage {
  readonly supportsMultipartUpload: true;
  createMultipartUpload(input: {
    key: string;
    contentType: string;
    byteSize: number;
    partSizeBytes?: number;
  }): Promise<MultipartUploadSession>;
  createSignedUploadPartUrls(input: {
    key: string;
    uploadId: string;
    partNumbers: number[];
    expiresInSeconds?: number;
  }): Promise<SignedUploadPart[]>;
  completeMultipartUpload(input: {
    key: string;
    uploadId: string;
    parts: CompletedUploadPart[];
  }): Promise<HeadObjectResult>;
  abortMultipartUpload(input: { key: string; uploadId: string }): Promise<void>;
  headObject(key: string): Promise<HeadObjectResult | null>;
}

export function isMultipartObjectStorage(
  storage: object,
): storage is MultipartObjectStorage {
  return (
    'supportsMultipartUpload' in storage &&
    (storage as MultipartObjectStorage).supportsMultipartUpload === true
  );
}

/** Default 16 MiB parts — balances R2 part limits with browser memory. */
export const DEFAULT_MULTIPART_PART_SIZE_BYTES = 16 * 1024 * 1024;

/** Free Supabase Storage max — never use for Match Studio VODs. */
export const SUPABASE_FREE_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
