import { mkdir } from 'node:fs/promises';
import type {
  FlowBrowserSession,
  FlowBrowserSessionFactory,
  FlowBrowserSessionOptions,
} from './browser-session.js';

/**
 * Launch Chromium with a persistent user-data profile (session cookies only).
 * Never stores Google passwords. CAPTCHA / login walls must stop automation.
 */
export const createPlaywrightBrowserSession: FlowBrowserSessionFactory = async (
  options: FlowBrowserSessionOptions,
): Promise<FlowBrowserSession> => {
  let playwright: typeof import('playwright');
  try {
    playwright = await import('playwright');
  } catch {
    throw new Error(
      'Playwright is not installed. Run `pnpm install` and `pnpm exec playwright install chromium`.',
    );
  }

  await mkdir(options.profileDir, { recursive: true });
  await mkdir(options.diagnosticDir, { recursive: true });

  // Prefer real Chrome/Edge when authenticating — Google blocks bundled Chromium sign-in.
  const preferred =
    options.channel?.trim() ||
    process.env.FLOW_BROWSER_CHANNEL?.trim() ||
    (options.headless ? '' : 'chrome');
  const channelCandidates = preferred ? [preferred, 'msedge', ''] : [''];

  let context: Awaited<ReturnType<typeof playwright.chromium.launchPersistentContext>> | null =
    null;
  let lastError: unknown = null;
  for (const channel of channelCandidates) {
    try {
      context = await playwright.chromium.launchPersistentContext(options.profileDir, {
        headless: options.headless,
        acceptDownloads: true,
        ...(channel ? { channel } : {}),
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!context) {
    throw new Error(
      `Unable to launch browser for Flow session${
        lastError instanceof Error ? `: ${lastError.message}` : ''
      }`,
    );
  }
  const page = context.pages()[0] ?? (await context.newPage());

  return {
    async goto(url) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    },
    async fill(selector, value) {
      await page.locator(selector).first().fill(value);
    },
    async click(selector) {
      await page.locator(selector).first().click();
    },
    async selectOption(selector, value) {
      const locator = page.locator(selector).first();
      try {
        await locator.selectOption({ label: value });
      } catch {
        await locator.click();
        await page.getByText(value, { exact: false }).first().click();
      }
    },
    async waitForSelector(selector, waitOptions) {
      await page
        .locator(selector)
        .first()
        .waitFor({
          state: 'visible',
          timeout: waitOptions?.timeoutMs ?? 60_000,
        });
    },
    async isVisible(selector) {
      try {
        return await page.locator(selector).first().isVisible({ timeout: 1_500 });
      } catch {
        return false;
      }
    },
    async textContent(selector) {
      return page.locator(selector).first().textContent();
    },
    async listOptionLabels(selector) {
      const locator = page.locator(selector).first();
      const options = locator.locator('option');
      const count = await options.count();
      if (count > 0) {
        const labels: string[] = [];
        for (let i = 0; i < count; i += 1) {
          const text = (await options.nth(i).textContent())?.trim();
          if (text) labels.push(text);
        }
        return labels;
      }
      // Open control and collect nearby visible menu items when not a <select>.
      try {
        await locator.click({ timeout: 2_000 });
      } catch {
        return [];
      }
      const items = page.locator('[role="option"], [role="menuitem"], li[data-value]');
      const itemCount = await items.count();
      const labels: string[] = [];
      for (let i = 0; i < Math.min(itemCount, 40); i += 1) {
        const text = (await items.nth(i).textContent())?.trim();
        if (text) labels.push(text);
      }
      return labels;
    },
    async screenshot(filePath) {
      await page.screenshot({ path: filePath, fullPage: true });
    },
    async downloadViaClick(selector, destinationPath) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 180_000 }),
        page.locator(selector).first().click(),
      ]);
      await download.saveAs(destinationPath);
    },
    async close() {
      await context.close();
    },
  };
};
