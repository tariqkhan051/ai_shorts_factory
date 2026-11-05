export type OcrReadResult = {
  text: string;
  /** 0–1 confidence when known; null if provider cannot estimate. */
  confidence: number | null;
  provider: string;
};

export interface OcrProvider {
  readonly name: string;
  readImage(imagePath: string): Promise<OcrReadResult>;
}
