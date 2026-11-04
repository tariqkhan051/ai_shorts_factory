import { describe, expect, it } from 'vitest';
import {
  isCharacterReferenceReady,
  validateReferenceImageBytes,
} from './reference-image.js';

function pngBytes(): Buffer {
  // Minimal PNG signature + padding (integrity check uses magic bytes only).
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
}

describe('validateReferenceImageBytes', () => {
  it('accepts PNG and computes sha256 without modifying bytes', () => {
    const bytes = pngBytes();
    const original = Buffer.from(bytes);
    const validated = validateReferenceImageBytes({
      bytes,
      filename: 'hero.png',
      declaredContentType: 'image/png',
    });
    expect(validated.contentType).toBe('image/png');
    expect(validated.sha256).toHaveLength(64);
    expect(validated.bytes.equals(original)).toBe(true);
  });

  it('rejects non-image payloads', () => {
    expect(() =>
      validateReferenceImageBytes({
        bytes: Buffer.from('not-an-image'),
        filename: 'x.bin',
      }),
    ).toThrow(/PNG, JPEG, or WebP/i);
  });

  it('does not treat a text prompt as reference-ready', () => {
    expect(isCharacterReferenceReady(null)).toBe(false);
    expect(isCharacterReferenceReady(undefined)).toBe(false);
    expect(isCharacterReferenceReady('asset-id')).toBe(true);
  });
});
