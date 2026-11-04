#!/usr/bin/env node
/**
 * Open Flow → New project (navigation only) and inspect generation controls.
 * NEVER clicks Generate/Create video. NEVER spends credits. NEVER logs cookies/tokens.
 */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'packages/flow-adapter/package.json'));
const playwright = require('playwright');

if (process.env.FLOW_EXECUTE_LIVE === 'true') {
  console.error(JSON.stringify({ error: 'Refusing inspection while FLOW_EXECUTE_LIVE=true' }));
  process.exit(1);
}

const profileDir =
  process.env.FLOW_BROWSER_PROFILE_DIR?.trim() || join(root, '.flow-profile');
const baseUrl = (process.env.FLOW_BASE_URL || 'https://flow.google.com/').trim();
const outDir = join(root, 'diagnostic-screenshots', 'canary');
const channel = process.env.FLOW_BROWSER_CHANNEL?.trim() || 'chrome';

await mkdir(outDir, { recursive: true });

const context = await playwright.chromium.launchPersistentContext(profileDir, {
  headless: false,
  acceptDownloads: false,
  channel,
});
const page = context.pages()[0] ?? (await context.newPage());

async function dump(label) {
  await new Promise((r) => setTimeout(r, 2500));
  const screenshotPath = join(outDir, `flow-${label}-${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const data = await page.evaluate(() => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const items = [];
    for (const el of document.querySelectorAll(
      'button, [role="button"], textarea, input, [contenteditable="true"], select, [role="textbox"], [role="combobox"], [role="listbox"], [role="tab"], a',
    )) {
      if (!visible(el)) continue;
      const text = (el.innerText || el.value || el.getAttribute('aria-label') || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 160);
      items.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        placeholder: el.getAttribute('placeholder'),
        testId: el.getAttribute('data-testid'),
        text,
      });
    }
    return {
      url: location.href,
      title: document.title,
      bodySample: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 2500),
      items: items.slice(0, 200),
    };
  });
  return { screenshotPath, ...data };
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const home = await dump('home');

  // Dismiss promo banner if present (not Generate).
  try {
    await page.locator('[aria-label="Promotional banner"] button').filter({ hasText: /^close$|^×$/i }).first().click({ timeout: 1500 });
  } catch {
    // ignore
  }

  // Navigate into project creation UI only.
  const newProject = page.getByRole('button', { name: /new project/i }).first();
  await newProject.click({ timeout: 15_000 });
  const afterClick = await dump('after-new-project');

  // If a text project name dialog appears, fill a canary name and continue WITHOUT generate.
  try {
    const nameInput = page.locator('input, textarea, [role="textbox"]').first();
    if (await nameInput.isVisible({ timeout: 3_000 })) {
      await nameInput.fill('ASF Canary Inspect');
      const continueBtn = page.getByRole('button', { name: /create|continue|next|done|ok/i }).first();
      if (await continueBtn.isVisible({ timeout: 2_000 })) {
        const label = ((await continueBtn.innerText().catch(() => '')) || '').toLowerCase();
        if (!/generate|create video|make video|render/.test(label)) {
          await continueBtn.click();
        }
      }
    }
  } catch {
    // dialog optional
  }

  const projectUi = await dump('project-ui');

  // Collect candidate controls related to prompt / settings without activating Generate.
  const candidates = projectUi.items.filter((item) => {
    const hay = `${item.text || ''} ${item.ariaLabel || ''} ${item.placeholder || ''}`.toLowerCase();
    return /prompt|describe|idea|model|aspect|ratio|duration|seconds|resolution|720|1080|9:16|vertical|settings|quality|generate|create|textbox|textarea/.test(
      hay,
    ) || item.tag === 'textarea' || item.role === 'textbox' || item.role === 'combobox';
  });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'NEW_PROJECT_INSPECT_NO_GENERATE',
    flowExecuteLive: false,
    generateClicked: false,
    homeUrl: home.url,
    projectUrl: projectUi.url,
    screenshots: [home.screenshotPath, afterClick.screenshotPath, projectUi.screenshotPath],
    homeItemCount: home.items.length,
    projectItemCount: projectUi.items.length,
    candidates,
    projectItems: projectUi.items,
    bodySample: projectUi.bodySample,
  };

  const reportPath = join(outDir, `flow-new-project-inspect-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(
    JSON.stringify(
      {
        reportPath,
        projectUrl: projectUi.url,
        projectItemCount: projectUi.items.length,
        candidateCount: candidates.length,
        screenshots: report.screenshots,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
}
