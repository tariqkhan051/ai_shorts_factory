import { ScriptedOcrProvider } from './scripted-ocr.js';
import { isTesseractAvailable, TesseractCliOcrProvider } from './tesseract-cli.js';
import type { OcrProvider } from './types.js';

export type CreateOcrProviderOptions = {
  /** Force a provider. Default: tesseract if available, else scripted empty. */
  prefer?: 'tesseract' | 'scripted' | 'paid_vision';
  scriptedResponses?: Record<string, { text: string; confidence?: number }>;
};

function paidVisionEnvEnabled(): boolean {
  return process.env.MATCH_PAID_VISION_ENABLED?.trim().toLowerCase() === 'true';
}

/**
 * Resolve an OCR provider. Default path is local-only (tesseract / scripted).
 * Paid cloud vision requires prefer:'paid_vision' AND MATCH_PAID_VISION_ENABLED=true,
 * and still throws until a concrete adapter is registered (no silent spend).
 */
export async function createOcrProvider(
  options: CreateOcrProviderOptions = {},
): Promise<OcrProvider> {
  if (options.prefer === 'paid_vision') {
    if (!paidVisionEnvEnabled()) {
      throw new Error(
        'Paid match vision is disabled (MATCH_PAID_VISION_ENABLED defaults false). Use local OCR.',
      );
    }
    throw new Error(
      'Paid match vision adapter is not registered. No cloud vision spend will occur.',
    );
  }

  if (options.prefer === 'scripted' || options.scriptedResponses) {
    return new ScriptedOcrProvider(options.scriptedResponses ?? {});
  }
  if (options.prefer === 'tesseract' || (await isTesseractAvailable())) {
    return new TesseractCliOcrProvider();
  }
  return new ScriptedOcrProvider({});
}
