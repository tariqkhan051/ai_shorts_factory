import { createHash } from 'node:crypto';

export const REFERENCE_IMAGE_MAX_BYTES = 15 * 1024 * 1024;

export const REFERENCE_IMAGE_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;

export type ReferenceImageMime = keyof typeof REFERENCE_IMAGE_MIME;

export type ValidatedReferenceImage = {
  bytes: Buffer;
  contentType: ReferenceImageMime;
  extension: string;
  sha256: string;
  byteSize: number;
  originalFilename: string;
};

function detectMime(bytes: Buffer): ReferenceImageMime | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export function validateReferenceImageBytes(input: {
  bytes: Buffer;
  filename: string;
  declaredContentType?: string | null;
}): ValidatedReferenceImage {
  if (!input.bytes.length) {
    throw new Error('Reference image is empty');
  }
  if (input.bytes.length > REFERENCE_IMAGE_MAX_BYTES) {
    throw new Error(`Reference image exceeds ${REFERENCE_IMAGE_MAX_BYTES} bytes`);
  }

  const detected = detectMime(input.bytes);
  if (!detected) {
    throw new Error('Reference image must be a valid PNG, JPEG, or WebP file');
  }

  const declared = input.declaredContentType?.toLowerCase().split(';')[0]?.trim();
  if (declared && declared !== detected && declared !== 'application/octet-stream') {
    // Trust magic bytes; reject only clearly conflicting image/* declarations.
    if (declared.startsWith('image/') && declared !== detected) {
      throw new Error(`Declared content type ${declared} does not match file contents (${detected})`);
    }
  }

  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const originalFilename = input.filename.split(/[/\\]/).pop() || `reference.${REFERENCE_IMAGE_MIME[detected]}`;

  return {
    bytes: input.bytes,
    contentType: detected,
    extension: REFERENCE_IMAGE_MIME[detected],
    sha256,
    byteSize: input.bytes.length,
    originalFilename,
  };
}

export function isCharacterReferenceReady(primaryReferenceAssetId: string | null | undefined): boolean {
  return Boolean(primaryReferenceAssetId);
}
