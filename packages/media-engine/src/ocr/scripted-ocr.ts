import type { OcrProvider, OcrReadResult } from './types.js';

/**
 * Deterministic OCR for unit tests / fixtures — no paid APIs, no binary deps.
 * Map keys are absolute or normalized image paths; also matches by basename.
 */
export class ScriptedOcrProvider implements OcrProvider {
  readonly name = 'scripted';

  constructor(
    private readonly responses: Record<string, { text: string; confidence?: number }>,
  ) {}

  async readImage(imagePath: string): Promise<OcrReadResult> {
    const basename = imagePath.split(/[/\\]/).pop() ?? imagePath;
    const hit =
      this.responses[imagePath] ??
      this.responses[basename] ??
      this.responses['*'];
    if (!hit) {
      return { text: '', confidence: 0, provider: this.name };
    }
    return {
      text: hit.text,
      confidence: hit.confidence ?? 0.99,
      provider: this.name,
    };
  }
}
