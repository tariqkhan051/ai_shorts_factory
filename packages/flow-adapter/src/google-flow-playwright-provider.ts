import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FlowBrowserSession, FlowBrowserSessionFactory } from './browser-session.js';
import { evaluateFlowLiveGates } from './flow-live-gates.js';
import { isRecipeVerified, listMissingSelectors, type FlowUiRecipe } from './flow-ui-recipe.js';
import type {
  DownloadedAsset,
  GenerationRequest,
  GenerationStatus,
  GenerationSubmission,
  ProviderAvailability,
  VideoGenerationProvider,
} from './provider.js';

const defaultPlaywrightSessionFactory: FlowBrowserSessionFactory = async (options) => {
  const { createPlaywrightBrowserSession } = await import('./playwright-session.js');
  return createPlaywrightBrowserSession(options);
};

export type GoogleFlowPlaywrightProviderOptions = {
  recipe: FlowUiRecipe;
  profileDir: string;
  diagnosticDir?: string;
  headless?: boolean;
  liveEnabled?: boolean;
  uiVerifiedFlag?: boolean;
  nodeEnv?: string;
  ci?: string;
  /** Injected for tests — defaults to real Playwright persistent context */
  sessionFactory?: FlowBrowserSessionFactory;
  pollIntervalMs?: number;
  completionTimeoutMs?: number;
};

type LiveJob = {
  request: GenerationRequest;
  submission: GenerationSubmission;
  status: GenerationStatus;
  observedCost: number | 'unknown';
  localAssetPath?: string;
};

/**
 * Browser automation against the Google Flow web UI.
 * Does not call invented Flow HTTP APIs. Refuses to run until live gates + verified recipe pass.
 */
export class GoogleFlowPlaywrightProvider implements VideoGenerationProvider {
  readonly name = 'google-flow-playwright';
  private readonly jobs = new Map<string, LiveJob>();
  private session: FlowBrowserSession | null = null;
  private readonly sessionFactory: FlowBrowserSessionFactory;
  private readonly diagnosticDir: string;
  private readonly headless: boolean;
  private readonly pollIntervalMs: number;
  private readonly completionTimeoutMs: number;

  constructor(private readonly options: GoogleFlowPlaywrightProviderOptions) {
    this.sessionFactory = options.sessionFactory ?? defaultPlaywrightSessionFactory;
    this.diagnosticDir = options.diagnosticDir ?? './diagnostic-screenshots';
    this.headless = options.headless ?? true;
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
    this.completionTimeoutMs = options.completionTimeoutMs ?? 10 * 60_000;
  }

  private gateCheck() {
    return evaluateFlowLiveGates({
      flowProvider: 'playwright',
      flowLiveEnabled: this.options.liveEnabled === true ? 'true' : 'false',
      flowUiVerified: this.options.uiVerifiedFlag === true ? 'true' : 'false',
      browserProfileDir: this.options.profileDir,
      recipeVerified: isRecipeVerified(this.options.recipe),
      nodeEnv: this.options.nodeEnv,
      ci: this.options.ci,
    });
  }

  async checkAvailability(): Promise<ProviderAvailability> {
    const gates = this.gateCheck();
    if (!gates.ok) {
      return {
        available: false,
        reason: 'not_configured',
        message: `Live Flow gated: ${gates.reasons.join('; ')}`,
      };
    }
    return {
      available: true,
      model: this.options.recipe.modelOptionLabel ?? 'ui-verified-model',
    };
  }

  async validateConfiguration(): Promise<{ ok: true } | { ok: false; message: string }> {
    const missing = listMissingSelectors(this.options.recipe);
    if (missing.length > 0) {
      return {
        ok: false,
        message: `Flow UI recipe missing selectors: ${missing.join(', ')}`,
      };
    }
    if (!isRecipeVerified(this.options.recipe)) {
      return {
        ok: false,
        message:
          'Flow UI recipe is not verified. Inspect live Flow, fill selectors, set verifiedAt, and FLOW_UI_VERIFIED=true.',
      };
    }
    const gates = this.gateCheck();
    if (!gates.ok) {
      return { ok: false, message: gates.reasons.join('; ') };
    }
    if (!this.options.profileDir.trim()) {
      return { ok: false, message: 'FLOW_BROWSER_PROFILE_DIR is required' };
    }
    return { ok: true };
  }

  async prepareSession(): Promise<void> {
    const config = await this.validateConfiguration();
    if (!config.ok) {
      throw new Error(config.message);
    }
    if (this.session) {
      return;
    }
    await mkdir(this.diagnosticDir, { recursive: true });
    this.session = await this.sessionFactory({
      profileDir: this.options.profileDir,
      headless: this.headless,
      baseUrl: this.options.recipe.baseUrl,
      diagnosticDir: this.diagnosticDir,
    });
    await this.session.goto(this.options.recipe.baseUrl);
    await this.assertNoHumanBlockers('prepareSession');
  }

  async submitGeneration(request: GenerationRequest): Promise<GenerationSubmission> {
    await this.prepareSession();
    const session = this.requireSession();
    const selectors = this.options.recipe.selectors;

    await this.assertNoHumanBlockers('submitGeneration:before');

    await session.fill(selectors.promptInput, request.prompt);

    if (this.options.recipe.modelOptionLabel) {
      await session.selectOption(selectors.modelControl, this.options.recipe.modelOptionLabel);
    } else {
      await session.click(selectors.modelControl);
    }
    await session.selectOption(selectors.durationControl, String(request.durationSeconds));
    await session.selectOption(selectors.resolutionControl, request.resolution);
    await session.click(selectors.submitButton);

    await this.assertNoHumanBlockers('submitGeneration:after');

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
      status: { state: 'running' },
      observedCost: 'unknown',
    });

    return submission;
  }

  async getGenerationStatus(submissionId: string): Promise<GenerationStatus> {
    const job = this.jobs.get(submissionId);
    if (!job) {
      return { state: 'failed', message: `Unknown submission: ${submissionId}` };
    }
    if (job.status.state === 'completed' || job.status.state === 'failed') {
      return job.status;
    }
    if (job.status.state === 'needs_human_intervention') {
      return job.status;
    }

    const session = this.requireSession();
    const intervention = await this.detectHumanBlockers();
    if (intervention) {
      job.status = intervention;
      return job.status;
    }

    const ready = await session.isVisible(this.options.recipe.selectors.resultReady);
    if (ready) {
      job.status = {
        state: 'completed',
        assetUrl: `flow-ui://download/${submissionId}`,
      };
      if (this.options.recipe.selectors.creditCostBadge) {
        const text = await session.textContent(this.options.recipe.selectors.creditCostBadge);
        const parsed = text ? Number.parseInt(text.replace(/[^\d]/g, ''), 10) : Number.NaN;
        job.observedCost = Number.isFinite(parsed) ? parsed : 'unknown';
      }
    }
    return job.status;
  }

  async waitForCompletion(
    submissionId: string,
    options?: { timeoutMs?: number },
  ): Promise<GenerationStatus> {
    const timeoutMs = options?.timeoutMs ?? this.completionTimeoutMs;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const status = await this.getGenerationStatus(submissionId);
      if (
        status.state === 'completed' ||
        status.state === 'failed' ||
        status.state === 'needs_human_intervention'
      ) {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
    return {
      state: 'needs_human_intervention',
      message: `Timed out waiting for Flow UI result after ${timeoutMs}ms`,
    };
  }

  async downloadAsset(submissionId: string, destinationPath: string): Promise<DownloadedAsset> {
    const job = this.jobs.get(submissionId);
    if (!job) {
      throw new Error(`Unknown submission: ${submissionId}`);
    }
    const status = await this.waitForCompletion(submissionId);
    if (status.state !== 'completed') {
      throw new Error(
        status.state === 'needs_human_intervention' || status.state === 'failed'
          ? status.message
          : 'Generation is not complete',
      );
    }

    const session = this.requireSession();
    await session.downloadViaClick(this.options.recipe.selectors.downloadButton, destinationPath);
    const bytes = await readFile(destinationPath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    job.localAssetPath = destinationPath;

    return {
      localPath: destinationPath,
      bytes: bytes.byteLength,
      sha256,
      contentType: 'application/octet-stream',
    };
  }

  async getObservedCreditCost(submissionId: string): Promise<number | 'unknown'> {
    const job = this.jobs.get(submissionId);
    return job?.observedCost ?? 'unknown';
  }

  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.close();
      this.session = null;
    }
  }

  private requireSession(): FlowBrowserSession {
    if (!this.session) {
      throw new Error('Browser session not prepared');
    }
    return this.session;
  }

  private async detectHumanBlockers(): Promise<GenerationStatus | null> {
    const session = this.requireSession();
    const selectors = this.options.recipe.selectors;
    if (selectors.captchaOrChallenge && (await session.isVisible(selectors.captchaOrChallenge))) {
      const diagnosticPath = await this.captureDiagnostic('captcha');
      return {
        state: 'needs_human_intervention',
        message: 'CAPTCHA or verification challenge detected — automation stopped',
        diagnosticPath,
      };
    }
    if (selectors.loginRequired && (await session.isVisible(selectors.loginRequired))) {
      const diagnosticPath = await this.captureDiagnostic('login-required');
      return {
        state: 'needs_human_intervention',
        message: 'Google sign-in required — complete login in the persistent profile manually',
        diagnosticPath,
      };
    }
    return null;
  }

  private async assertNoHumanBlockers(phase: string): Promise<void> {
    const blocker = await this.detectHumanBlockers();
    if (blocker && blocker.state === 'needs_human_intervention') {
      throw new Error(`${phase}: ${blocker.message}`);
    }
  }

  private async captureDiagnostic(label: string): Promise<string> {
    const session = this.requireSession();
    const filePath = join(this.diagnosticDir, `flow-${label}-${Date.now()}.png`);
    await session.screenshot(filePath);
    return filePath;
  }
}
