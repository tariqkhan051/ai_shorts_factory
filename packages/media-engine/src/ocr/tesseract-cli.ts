import { runCommand } from '../run-command.js';
import type { OcrProvider, OcrReadResult } from './types.js';

/**
 * Optional local Tesseract CLI OCR. Never calls paid cloud vision APIs.
 */
export class TesseractCliOcrProvider implements OcrProvider {
  readonly name = 'tesseract-cli';

  constructor(private readonly binary = process.env.TESSERACT_PATH || 'tesseract') {}

  async readImage(imagePath: string): Promise<OcrReadResult> {
    const result = await runCommand(this.binary, [imagePath, 'stdout', '--psm', '6'], {
      timeoutMs: 60_000,
    });
    if (result.code !== 0) {
      throw new Error(`tesseract failed: ${result.stderr || result.stdout}`);
    }
    const text = result.stdout.trim();
    return {
      text,
      confidence: text ? 0.7 : 0,
      provider: this.name,
    };
  }
}

export async function isTesseractAvailable(
  binary = process.env.TESSERACT_PATH || 'tesseract',
): Promise<boolean> {
  try {
    const result = await runCommand(binary, ['--version'], { timeoutMs: 10_000 });
    return result.code === 0;
  } catch {
    return false;
  }
}
