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

  const context = await playwright.chromium.launchPersistentContext(options.profileDir, {
    headless: options.headless,
    acceptDownloads: true,
  });
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
