export type AudioEventHit = {
  eventHint: string;
  timestampSeconds: number;
  confidence: number;
  evidenceRef: string;
  detector: string;
};

export type AudioEventDetectionInput = {
  audioOrVideoPath: string;
  workDir: string;
  serverEnvironment: 'original' | 'advance';
};

export type AudioEventDetectorStatus = 'ready' | 'unavailable' | 'stub';

export interface AudioEventDetector {
  readonly name: string;
  readonly status: AudioEventDetectorStatus;
  detect(input: AudioEventDetectionInput): Promise<AudioEventHit[]>;
}
