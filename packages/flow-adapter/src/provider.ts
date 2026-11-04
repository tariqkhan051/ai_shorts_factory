/**
 * Video generation provider contract.
 * Live Google Flow automation is Phase 4 and is NOT production-ready until
 * the real UI has been inspected and a permitted automation approach verified.
 */

export type ProviderAvailability =
  | { available: true; model: string; observedCost?: number }
  | {
      available: false;
      reason:
        | 'unsupported_model'
        | 'controls_unavailable'
        | 'auth_expired'
        | 'captcha_or_verification'
        | 'compatibility_error'
        | 'not_configured'
        | 'unknown';
      message: string;
    };

export type GenerationSubmission = {
  submissionId: string;
  submittedAt: string;
  model: string;
  durationSeconds: number;
  resolution: string;
  prompt: string;
};

export type GenerationStatus =
  | { state: 'queued' | 'running' }
  | { state: 'completed'; assetUrl: string }
  | { state: 'failed'; message: string; diagnosticPath?: string }
  | { state: 'needs_human_intervention'; message: string; diagnosticPath?: string };

export type DownloadedAsset = {
  localPath: string;
  bytes: number;
  sha256: string;
  contentType: string;
};

export type GenerationRequest = {
  idempotencyKey: string;
  prompt: string;
  model: string;
  durationSeconds: number;
  resolution: string;
  referenceAssetPaths?: string[];
};

export interface VideoGenerationProvider {
  readonly name: string;
  checkAvailability(): Promise<ProviderAvailability>;
  validateConfiguration(): Promise<{ ok: true } | { ok: false; message: string }>;
  prepareSession(): Promise<void>;
  submitGeneration(request: GenerationRequest): Promise<GenerationSubmission>;
  getGenerationStatus(submissionId: string): Promise<GenerationStatus>;
  waitForCompletion(
    submissionId: string,
    options?: { timeoutMs?: number },
  ): Promise<GenerationStatus>;
  downloadAsset(submissionId: string, destinationPath: string): Promise<DownloadedAsset>;
  getObservedCreditCost(submissionId: string): Promise<number | 'unknown'>;
}
