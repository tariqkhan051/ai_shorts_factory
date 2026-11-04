import { randomUUID } from 'node:crypto';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import type {
  DownloadedAsset,
  GenerationRequest,
  GenerationStatus,
  GenerationSubmission,
  ProviderAvailability,
  VideoGenerationProvider,
} from './provider.js';

export type GoogleFlowManualProviderOptions = {
  model?: string;
  estimatedCostPerScene?: number | 'unknown';
  aspectRatio?: string;
  resolution?: string;
  durationSeconds?: number;
};

type ManualJob = {
  request: GenerationRequest;
  submission: GenerationSubmission;
};

/**
 * Prepares generation work for a human operator.
 * Never launches Playwright, never clicks Generate, never downloads from Flow.
 */
export class GoogleFlowManualProvider implements VideoGenerationProvider {
  readonly name = 'google-flow-manual';
  private readonly jobs = new Map<string, ManualJob>();
  private readonly model: string;
  private readonly estimatedCost: number | 'unknown';

  constructor(options: GoogleFlowManualProviderOptions = {}) {
    this.model = options.model?.trim() || BUSINESS_DEFAULTS.defaultGenerationModel;
    this.estimatedCost =
      options.estimatedCostPerScene ?? BUSINESS_DEFAULTS.estimatedCostPerScene;
  }

  async checkAvailability(): Promise<ProviderAvailability> {
    return {
      available: true,
      model: this.model,
      observedCost: typeof this.estimatedCost === 'number' ? this.estimatedCost : undefined,
    };
  }

  async validateConfiguration(): Promise<{ ok: true } | { ok: false; message: string }> {
    return { ok: true };
  }

  async prepareSession(): Promise<void> {
    // No browser session — operator uses normal Chrome independently.
  }

  async submitGeneration(request: GenerationRequest): Promise<GenerationSubmission> {
    const existing = [...this.jobs.values()].find(
      (job) => job.request.idempotencyKey === request.idempotencyKey,
    );
    if (existing) {
      return existing.submission;
    }

    const submission: GenerationSubmission = {
      submissionId: `manual-${randomUUID()}`,
      submittedAt: new Date().toISOString(),
      model: request.model || this.model,
      durationSeconds: request.durationSeconds,
      resolution: request.resolution,
      prompt: request.prompt,
    };
    this.jobs.set(submission.submissionId, { request, submission });
    return submission;
  }

  async getGenerationStatus(submissionId: string): Promise<GenerationStatus> {
    const job = this.jobs.get(submissionId);
    if (!job) {
      return { state: 'failed', message: `Unknown manual submission: ${submissionId}` };
    }
    return {
      state: 'needs_human_intervention',
      message:
        'google-flow-manual does not generate in-browser. Copy the prompt from the Flow Generation Package, generate in normal Chrome, then upload the MP4 for verification.',
    };
  }

  async waitForCompletion(submissionId: string): Promise<GenerationStatus> {
    return this.getGenerationStatus(submissionId);
  }

  async downloadAsset(): Promise<DownloadedAsset> {
    throw new Error(
      'google-flow-manual cannot download from Google Flow. Upload the operator-downloaded MP4 through the application.',
    );
  }

  async getObservedCreditCost(): Promise<number | 'unknown'> {
    return 'unknown';
  }
}
