export type TtsVoice = {
  id: string;
  label: string;
};

export type TtsSynthesizeInput = {
  text: string;
  voiceId: string;
  speed?: number;
  outputPath: string;
};

export type TtsSynthesizeResult = {
  durationSeconds: number;
  byteSize: number;
  outputPath: string;
};

export type TtsProviderStatus = 'ready' | 'unconfigured' | 'disabled_by_spend_gate';

export interface TtsProvider {
  readonly name: string;
  readonly status: TtsProviderStatus;
  listVoices(): Promise<TtsVoice[]>;
  synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult>;
  estimateCost?(chars: number): number | null;
}
