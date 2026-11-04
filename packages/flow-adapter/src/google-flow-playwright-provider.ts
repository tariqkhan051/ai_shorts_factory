import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FlowSessionStatus } from '@ai-shorts-factory/shared-types';
import type { FlowBrowserSession, FlowBrowserSessionFactory } from './browser-session.js';
import { evaluateFlowLiveGates } from './flow-live-gates.js';
import { isRecipeVerified, listMissingSelectors, type FlowUiRecipe } from './flow-ui-recipe.js';
import type {
  DownloadedAsset,
  FlowUiOptionInventory,
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
  /** When true, inspect UI options and refuse silent model substitution */
  requireExactModelMatch?: boolean;
};

type LiveJob = {
  request: GenerationRequest;
  submission: GenerationSubmission;
  status: GenerationStatus;
  observedCost: number | 'unknown';
  localAssetPath?: string;
  submitClicked: boolean;
};

/**
 * Browser automation against the Google Flow web UI.
 * Does not call invented Flow HTTP APIs. Refuses to run until live gates + verified recipe pass.
 */
export class GoogleFlowPlaywrightProvider implements VideoGenerationProvider {
  readonly name = 'google-flow-playwright';
  private readonly jobs = new Map<string, LiveJob>();
  private readonly jobsByIdempotency = new Map<string, string>();
  private session: FlowBrowserSession | null = null;
  private readonly sessionFactory: FlowBrowserSessionFactory;
  private readonly diagnosticDir: string;
  private readonly headless: boolean;
  private readonly pollIntervalMs: number;
  private readonly completionTimeoutMs: number;
  private readonly requireExactModelMatch: boolean;
  private lastSessionStatus: FlowSessionStatus = 'NOT_CONFIGURED';
  private lastSessionMessage = 'Session not prepared';

  constructor(private readonly options: GoogleFlowPlaywrightProviderOptions) {
    this.sessionFactory = options.sessionFactory ?? defaultPlaywrightSessionFactory;
    this.diagnosticDir = options.diagnosticDir ?? './diagnostic-screenshots';
    this.headless = options.headless ?? true;
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.completionTimeoutMs = options.completionTimeoutMs ?? 10 * 60_000;
    this.requireExactModelMatch = options.requireExactModelMatch ?? true;
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

  getCachedSessionStatus(): { status: FlowSessionStatus; message: string } {
    return { status: this.lastSessionStatus, message: this.lastSessionMessage };
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
      this.lastSessionStatus = 'ERROR';
      this.lastSessionMessage = config.message;
      throw new Error(config.message);
    }
    if (this.session) {
      await this.refreshSessionStatus();
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
    await this.refreshSessionStatus();
    if (
      this.lastSessionStatus === 'AUTHENTICATION_REQUIRED' ||
      this.lastSessionStatus === 'HUMAN_INTERVENTION_REQUIRED' ||
      this.lastSessionStatus === 'SESSION_EXPIRED'
    ) {
      throw new Error(`${this.lastSessionStatus}: ${this.lastSessionMessage}`);
    }
  }

  /**
   * Inspect visible Flow UI options. Never invents models — reads the page.
   */
  async inspectAvailableOptions(): Promise<FlowUiOptionInventory> {
    await this.prepareSession();
    const session = this.requireSession();
    const selectors = this.options.recipe.selectors;
    const models = session.listOptionLabels
      ? await session.listOptionLabels(selectors.modelControl)
      : [];
    const durations = session.listOptionLabels
      ? await session.listOptionLabels(selectors.durationControl)
      : [];
    const resolutions = session.listOptionLabels
      ? await session.listOptionLabels(selectors.resolutionControl)
      : [];
    const aspectRatios =
      selectors.aspectRatioControl && session.listOptionLabels
        ? await session.listOptionLabels(selectors.aspectRatioControl)
        : [];
    return { models, durations, resolutions, aspectRatios };
  }

  async submitGeneration(request: GenerationRequest): Promise<GenerationSubmission> {
    const existingId = this.jobsByIdempotency.get(request.idempotencyKey);
    if (existingId) {
      const existing = this.jobs.get(existingId);
      if (existing) {
        return existing.submission;
      }
    }

    await this.prepareSession();
    const session = this.requireSession();
    const selectors = this.options.recipe.selectors;

    await this.assertNoHumanBlockers('submitGeneration:before');

    if (this.requireExactModelMatch) {
      await this.assertRequestedOptionsAvailable(request);
    }

    const submission: GenerationSubmission = {
      submissionId: randomUUID(),
      submittedAt: new Date().toISOString(),
      model: request.model,
      durationSeconds: request.durationSeconds,
      resolution: request.resolution,
      prompt: request.prompt,
    };

    // Persist in-memory job BEFORE clicking Generate so a crash mid-click can be reconciled.
    const job: LiveJob = {
      request,
      submission,
      status: { state: 'queued' },
      observedCost: 'unknown',
      submitClicked: false,
    };
    this.jobs.set(submission.submissionId, job);
    this.jobsByIdempotency.set(request.idempotencyKey, submission.submissionId);

    await session.fill(selectors.promptInput, request.prompt);

    // Character consistency: attach Ingredients / reference images before Generate.
    if (request.referenceAssetPaths?.length && session.attachFiles) {
      const addIngredients =
        (selectors as { addIngredientsButton?: string }).addIngredientsButton?.trim() ||
        'button[aria-label="Add ingredients to the prompt box"]';
      for (const filePath of request.referenceAssetPaths) {
        await session.attachFiles(addIngredients, [filePath]);
      }
    }

    // Ensure Video composer options via Settings trigger when present.
    const settingsTrigger = 'button[aria-label="Settings trigger"]';
    if (await session.isVisible(settingsTrigger)) {
      await session.click(settingsTrigger);
      try {
        await session.selectOption(settingsTrigger, 'Video');
      } catch {
        // Already on video or radio selected elsewhere.
      }
      const aspect =
        request.aspectRatio ??
        this.options.recipe.aspectRatioOptionLabel ??
        undefined;
      if (aspect) {
        try {
          await session.selectOption(settingsTrigger, aspect);
        } catch {
          // Aspect may already match pill / radios.
        }
      }
      try {
        await session.selectOption(settingsTrigger, 'x1');
      } catch {
        // Output count control may already be x1.
      }
    }

    const modelLabel = this.options.recipe.modelOptionLabel ?? request.model;
    if (this.options.recipe.modelOptionLabel) {
      await session.selectOption(selectors.modelControl, modelLabel);
    } else {
      await session.click(selectors.modelControl);
      await session.selectOption(selectors.modelControl, request.model);
    }
    await session.selectOption(selectors.durationControl, String(request.durationSeconds));
    await session.selectOption(selectors.resolutionControl, request.resolution);

    const aspect =
      request.aspectRatio ??
      this.options.recipe.aspectRatioOptionLabel ??
      undefined;
    if (aspect && selectors.aspectRatioControl?.trim()) {
      await session.selectOption(selectors.aspectRatioControl, aspect);
    }

    await session.click(selectors.submitButton);
    job.submitClicked = true;
    job.status = { state: 'running' };

    await this.assertNoHumanBlockers('submitGeneration:after');

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
    // Timeout ≠ failure. Credits may already be consumed.
    return {
      state: 'needs_human_intervention',
      message: `Timed out waiting for Flow UI result after ${timeoutMs}ms — do not assume generation failed; reconcile manually`,
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
    if (bytes.byteLength === 0) {
      throw new Error('Downloaded Flow asset is empty (0 bytes)');
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    job.localAssetPath = destinationPath;

    return {
      localPath: destinationPath,
      bytes: bytes.byteLength,
      sha256,
      contentType: 'video/mp4',
    };
  }

  async getObservedCreditCost(submissionId: string): Promise<number | 'unknown'> {
    const job = this.jobs.get(submissionId);
    return job?.observedCost ?? 'unknown';
  }

  wasSubmitClicked(submissionId: string): boolean {
    return this.jobs.get(submissionId)?.submitClicked === true;
  }

  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.close();
      this.session = null;
    }
  }

  private async assertRequestedOptionsAvailable(request: GenerationRequest): Promise<void> {
    const inventory = await this.inspectAvailableOptions();
    const modelLabel = this.options.recipe.modelOptionLabel ?? request.model;
    if (inventory.models.length > 0 && !inventory.models.some((m) => includesLoose(m, modelLabel))) {
      throw new Error(
        `Requested model "${modelLabel}" is not available in this Flow account. Observed: ${inventory.models.join(', ') || '(none)'}. Refusing silent substitution.`,
      );
    }
    if (
      inventory.durations.length > 0 &&
      !inventory.durations.some((d) => includesLoose(d, String(request.durationSeconds)))
    ) {
      throw new Error(
        `Requested duration ${request.durationSeconds}s is not available. Observed: ${inventory.durations.join(', ')}. Refusing silent substitution.`,
      );
    }
    if (
      inventory.resolutions.length > 0 &&
      !inventory.resolutions.some((r) => includesLoose(r, request.resolution))
    ) {
      throw new Error(
        `Requested resolution "${request.resolution}" is not available. Observed: ${inventory.resolutions.join(', ')}. Refusing silent substitution.`,
      );
    }
    const aspect = request.aspectRatio ?? this.options.recipe.aspectRatioOptionLabel;
    if (
      aspect &&
      inventory.aspectRatios.length > 0 &&
      !inventory.aspectRatios.some((a) => includesLoose(a, aspect))
    ) {
      throw new Error(
        `Requested aspect ratio "${aspect}" is not available. Observed: ${inventory.aspectRatios.join(', ')}. Refusing silent substitution.`,
      );
    }
  }

  private requireSession(): FlowBrowserSession {
    if (!this.session) {
      throw new Error('Browser session not prepared');
    }
    return this.session;
  }

  private async refreshSessionStatus(): Promise<void> {
    const session = this.requireSession();
    const selectors = this.options.recipe.selectors;

    if (selectors.captchaOrChallenge && (await session.isVisible(selectors.captchaOrChallenge))) {
      this.lastSessionStatus = 'HUMAN_INTERVENTION_REQUIRED';
      this.lastSessionMessage =
        'CAPTCHA or identity verification detected — complete it manually in the browser profile. Automation will not bypass security controls.';
      await this.captureDiagnostic('captcha');
      return;
    }
    if (selectors.loginRequired && (await session.isVisible(selectors.loginRequired))) {
      this.lastSessionStatus = 'AUTHENTICATION_REQUIRED';
      this.lastSessionMessage =
        'Sign in to Google Flow manually in the persistent browser profile. Passwords are never stored in application configuration.';
      await this.captureDiagnostic('login-required');
      return;
    }
    if (selectors.workspaceReady) {
      const ready = await session.isVisible(selectors.workspaceReady);
      if (!ready) {
        this.lastSessionStatus = 'SESSION_EXPIRED';
        this.lastSessionMessage =
          'Authenticated Flow workspace not visible — re-authenticate in the persistent profile.';
        await this.captureDiagnostic('workspace-missing');
        return;
      }
    }

    this.lastSessionStatus = 'READY';
    this.lastSessionMessage = 'Flow workspace appears accessible';
  }

  private async detectHumanBlockers(): Promise<GenerationStatus | null> {
    await this.refreshSessionStatus();
    if (
      this.lastSessionStatus === 'AUTHENTICATION_REQUIRED' ||
      this.lastSessionStatus === 'HUMAN_INTERVENTION_REQUIRED' ||
      this.lastSessionStatus === 'SESSION_EXPIRED'
    ) {
      return {
        state: 'needs_human_intervention',
        message: this.lastSessionMessage,
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

function includesLoose(haystack: string, needle: string): boolean {
  const a = haystack.toLowerCase().replace(/\s+/g, '');
  const b = needle.toLowerCase().replace(/\s+/g, '');
  return a.includes(b) || b.includes(a);
}
