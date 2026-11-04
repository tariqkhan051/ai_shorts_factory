import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FlowBrowserSession } from './browser-session.js';
import { createUnverifiedFlowUiRecipe } from './flow-ui-recipe.js';
import { GoogleFlowPlaywrightProvider } from './google-flow-playwright-provider.js';

function verifiedRecipe() {
  return createUnverifiedFlowUiRecipe({
    verifiedAt: '2026-11-04T00:00:00.000Z',
    verifiedBy: 'test-operator',
    baseUrl: 'https://flow.example.test/',
    modelOptionLabel: 'Gemini Omni Flash',
    selectors: {
      promptInput: '#prompt',
      modelControl: '#model',
      durationControl: '#duration',
      resolutionControl: '#resolution',
      submitButton: '#submit',
      resultReady: '#ready',
      downloadButton: '#download',
      creditCostBadge: '#cost',
      captchaOrChallenge: '#captcha',
      loginRequired: '#login',
    },
  });
}

function createFakeSession(options?: { captcha?: boolean; login?: boolean; readyAfter?: number }): {
  session: FlowBrowserSession;
  actions: string[];
} {
  const actions: string[] = [];
  let polls = 0;
  const session: FlowBrowserSession = {
    async goto(url) {
      actions.push(`goto:${url}`);
    },
    async fill(selector, value) {
      actions.push(`fill:${selector}:${value}`);
    },
    async click(selector) {
      actions.push(`click:${selector}`);
    },
    async selectOption(selector, value) {
      actions.push(`select:${selector}:${value}`);
    },
    async waitForSelector(selector) {
      actions.push(`wait:${selector}`);
    },
    async isVisible(selector) {
      if (selector === '#captcha') return Boolean(options?.captcha);
      if (selector === '#login') return Boolean(options?.login);
      if (selector === '#ready') {
        polls += 1;
        return polls > (options?.readyAfter ?? 0);
      }
      return false;
    },
    async textContent(selector) {
      if (selector === '#cost') return '10 credits';
      return null;
    },
    async screenshot(filePath) {
      actions.push(`screenshot:${filePath}`);
      await writeFile(filePath, Buffer.from('png'));
    },
    async downloadViaClick(selector, destinationPath) {
      actions.push(`download:${selector}`);
      await writeFile(destinationPath, Buffer.from('fake-flow-bytes'));
    },
    async close() {
      actions.push('close');
    },
  };
  return { session, actions };
}

describe('GoogleFlowPlaywrightProvider', () => {
  it('refuses live work when recipe is unverified', async () => {
    const provider = new GoogleFlowPlaywrightProvider({
      recipe: createUnverifiedFlowUiRecipe({ baseUrl: 'https://flow.example.test/' }),
      profileDir: '/tmp/profile',
      liveEnabled: true,
      uiVerifiedFlag: true,
      nodeEnv: 'development',
    });
    const config = await provider.validateConfiguration();
    expect(config.ok).toBe(false);
  });

  it('runs a single-scene happy path through injected browser session', async () => {
    const { session, actions } = createFakeSession({ readyAfter: 0 });
    const provider = new GoogleFlowPlaywrightProvider({
      recipe: verifiedRecipe(),
      profileDir: '/tmp/profile',
      liveEnabled: true,
      uiVerifiedFlag: true,
      nodeEnv: 'development',
      sessionFactory: async () => session,
      pollIntervalMs: 1,
    });

    const availability = await provider.checkAvailability();
    expect(availability.available).toBe(true);

    const submission = await provider.submitGeneration({
      idempotencyKey: 'scene-1',
      prompt: 'A neon courier runs through rain',
      model: 'gemini-omni-flash',
      durationSeconds: 6,
      resolution: '720p',
    });

    const status = await provider.waitForCompletion(submission.submissionId, { timeoutMs: 1000 });
    expect(status.state).toBe('completed');

    const dir = await mkdtemp(join(tmpdir(), 'asf-flow-'));
    const dest = join(dir, 'scene.bin');
    const downloaded = await provider.downloadAsset(submission.submissionId, dest);
    expect(downloaded.bytes).toBeGreaterThan(0);
    expect(await readFile(dest)).toEqual(Buffer.from('fake-flow-bytes'));
    expect(await provider.getObservedCreditCost(submission.submissionId)).toBe(10);

    expect(actions.some((item) => item.startsWith('fill:#prompt:'))).toBe(true);
    expect(actions).toContain('click:#submit');
    await provider.dispose();
  });

  it('stops on CAPTCHA with needs_human_intervention', async () => {
    const { session } = createFakeSession({ captcha: true });
    const provider = new GoogleFlowPlaywrightProvider({
      recipe: verifiedRecipe(),
      profileDir: '/tmp/profile',
      diagnosticDir: await mkdtemp(join(tmpdir(), 'asf-diag-')),
      liveEnabled: true,
      uiVerifiedFlag: true,
      nodeEnv: 'development',
      sessionFactory: async () => session,
    });

    await expect(
      provider.submitGeneration({
        idempotencyKey: 'blocked',
        prompt: 'test',
        model: 'gemini-omni-flash',
        durationSeconds: 6,
        resolution: '720p',
      }),
    ).rejects.toThrow(/CAPTCHA/i);
  });
});
