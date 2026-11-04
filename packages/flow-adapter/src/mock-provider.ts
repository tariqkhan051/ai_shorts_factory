import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type {
  DownloadedAsset,
  GenerationRequest,
  GenerationStatus,
  GenerationSubmission,
  ProviderAvailability,
  VideoGenerationProvider,
} from './provider.js';

type MockJob = {
  request: GenerationRequest;
  submission: GenerationSubmission;
  status: GenerationStatus;
  cost: number;
};

/**
 * Deterministic mock provider for development and CI.
 * Never talks to Google Flow and never consumes real credits.
 */
export class MockVideoGenerationProvider implements VideoGenerationProvider {
  readonly name = 'mock';
  private readonly jobs = new Map<string, MockJob>();
  private readonly costPerGeneration: number;

  constructor(options?: { costPerGeneration?: number }) {
    this.costPerGeneration = options?.costPerGeneration ?? 10;
  }

  async checkAvailability(): Promise<ProviderAvailability> {
    return { available: true, model: 'mock-omni-flash', observedCost: this.costPerGeneration };
  }

  async validateConfiguration(): Promise<{ ok: true } | { ok: false; message: string }> {
    return { ok: true };
  }

  async prepareSession(): Promise<void> {
    return;
  }

  async submitGeneration(request: GenerationRequest): Promise<GenerationSubmission> {
    const existing = [...this.jobs.values()].find(
      (job) => job.request.idempotencyKey === request.idempotencyKey,
    );
    if (existing) {
      return existing.submission;
    }

    const submission: GenerationSubmission = {
      submissionId: randomUUID(),
      submittedAt: new Date().toISOString(),
      model: request.model,
      durationSeconds: request.durationSeconds,
      resolution: request.resolution,
      prompt: request.prompt,
    };

    this.jobs.set(submission.submissionId, {
      request,
      submission,
      status: { state: 'completed', assetUrl: `mock://asset/${submission.submissionId}` },
      cost: this.costPerGeneration,
    });

    return submission;
  }

  async getGenerationStatus(submissionId: string): Promise<GenerationStatus> {
    const job = this.jobs.get(submissionId);
    if (!job) {
      return { state: 'failed', message: `Unknown submission: ${submissionId}` };
    }
    return job.status;
  }

  async waitForCompletion(submissionId: string): Promise<GenerationStatus> {
    return this.getGenerationStatus(submissionId);
  }

  async downloadAsset(submissionId: string, destinationPath: string): Promise<DownloadedAsset> {
    const job = this.jobs.get(submissionId);
    if (!job) {
      throw new Error(`Unknown submission: ${submissionId}`);
    }

    // Minimal valid-looking placeholder bytes for pipeline tests (not a real MP4).
    const payload = Buffer.from(`mock-video:${submissionId}:${job.request.prompt}`, 'utf8');
    await writeFile(destinationPath, payload);
    const sha256 = createHash('sha256').update(payload).digest('hex');

    return {
      localPath: destinationPath,
      bytes: payload.byteLength,
      sha256,
      contentType: 'application/octet-stream',
    };
  }

  async getObservedCreditCost(submissionId: string): Promise<number | 'unknown'> {
    const job = this.jobs.get(submissionId);
    return job ? job.cost : 'unknown';
  }
}
