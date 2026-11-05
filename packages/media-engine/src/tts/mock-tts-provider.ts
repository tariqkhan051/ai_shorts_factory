import { writeFile } from 'node:fs/promises';
import type { TtsProvider, TtsSynthesizeInput, TtsSynthesizeResult, TtsVoice } from './types.js';

/**
 * Deterministic mock TTS — writes a tiny WAV header + silence proportional to text length.
 * Never calls paid APIs.
 */
export class MockTtsProvider implements TtsProvider {
  readonly name = 'mock-tts';
  readonly status = 'ready' as const;

  async listVoices(): Promise<TtsVoice[]> {
    return [
      { id: 'mock-neutral', label: 'Mock Neutral' },
      { id: 'mock-energetic', label: 'Mock Energetic' },
    ];
  }

  async synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult> {
    const voices = await this.listVoices();
    if (!voices.some((v) => v.id === input.voiceId)) {
      throw new Error(`Unknown mock voice: ${input.voiceId}`);
    }
    const speed = input.speed && input.speed > 0 ? input.speed : 1;
    const durationSeconds = Math.max(0.4, (input.text.length / 14) / speed);
    const sampleRate = 8000;
    const numSamples = Math.floor(durationSeconds * sampleRate);
    const dataSize = numSamples * 2;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    await writeFile(input.outputPath, buffer);
    return {
      durationSeconds,
      byteSize: buffer.byteLength,
      outputPath: input.outputPath,
    };
  }

  estimateCost(chars: number): number | null {
    return chars * 0;
  }
}
