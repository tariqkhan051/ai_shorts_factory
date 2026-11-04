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
      const candidates = Array.from(
        new Set(
          [
            value,
            `${value}s`,
            `${value} s`,
            value.replace(/\s*s$/i, ''),
            value.replace(/p$/i, ''),
            `${value.replace(/p$/i, '')}p`,
          ].filter((v) => v.trim().length > 0),
        ),
      );

      try {
        await locator.selectOption({ label: value });
        return;
      } catch {
        // Not a native <select> — fall through to menu / assert paths.
      }

      try {
        await locator.click({ timeout: 2_000 });
      } catch {
        // Control may already be open.
      }

      for (const candidate of candidates) {
        const option = page
          .getByRole('option', { name: new RegExp(candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
          .or(
            page.getByRole('menuitem', {
              name: new RegExp(candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
            }),
          )
          .or(
            page.getByRole('radio', {
              name: new RegExp(candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
            }),
          );
        try {
          if (await option.first().isVisible({ timeout: 700 })) {
            await option.first().click();
            return;
          }
        } catch {
          // try next candidate
        }
      }

      // Some Flow controls (e.g. Settings trigger pill "Video · 720p · 8s") expose a
      // fixed value with no discrete picker — accept when already visible on the control.
      const text = ((await locator.textContent()) || '').replace(/\s+/g, ' ');
      const alreadySelected = candidates.some((candidate) =>
        text.toLowerCase().includes(candidate.toLowerCase()),
      );
      if (alreadySelected) {
        return;
      }
      throw new Error(
        `Unable to select option "${value}" for ${selector}; visible text="${text.slice(0, 120)}"`,
      );
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
    async attachFiles(selector, filePaths) {
      const locator = page.locator(selector).first();
      const tag = await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
      if (tag === 'input') {
        await locator.setInputFiles(filePaths);
        return;
      }
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 15_000 }),
        locator.click({ timeout: 10_000 }),
      ]);
      await chooser.setFiles(filePaths);
    },
    async close() {
      await context.close();
    },
  };
};
