#!/usr/bin/env node
/**
 * Inspect "Learn about generation costs" + Scenes UI for duration/resolution hints.
 * NEVER clicks Start generation.
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
const projectUrl =
  process.env.FLOW_PROJECT_URL?.trim() ||
  'https://flow.google.com/project/cd052117-55ba-426e-a396-9eb70d48dbfa';
const outDir = join(root, 'diagnostic-screenshots', 'canary');
const channel = process.env.FLOW_BROWSER_CHANNEL?.trim() || 'chrome';

await mkdir(outDir, { recursive: true });

const context = await playwright.chromium.launchPersistentContext(profileDir, {
  headless: false,
  acceptDownloads: false,
  channel,
});
const page = context.pages()[0] ?? (await context.newPage());

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shot(name) {
  const path = join(outDir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function bodyText() {
  return page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 6000));
}

const findings = [];

try {
  await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(3500);

  // Open session / prompt area.
  const prompt = page.locator('[role="textbox"][aria-label="What do you want to create?"]');
  if (await prompt.count()) {
    await prompt.click({ timeout: 5_000 });
    await sleep(800);
  }

  const costs = page.getByText(/Learn about generation costs/i);
  if (await costs.count()) {
    await costs.first().click({ timeout: 5_000 });
    await sleep(2500);
    findings.push({
      step: 'generation-costs',
      screenshot: await shot('flow-gen-costs'),
      body: await bodyText(),
    });
    await page.keyboard.press('Escape');
    await sleep(500);
  } else {
    findings.push({ step: 'generation-costs-not-found' });
  }

  // Scenes nav
  const scenes = page.getByRole('button', { name: /^Scenes$/i }).or(page.locator('text=Scenes').first());
  try {
    await page.locator('button, a, [role="button"]').filter({ hasText: /^Scenes$/i }).first().click({ timeout: 5_000 });
    await sleep(2500);
    findings.push({
      step: 'scenes',
      screenshot: await shot('flow-gen-scenes'),
      body: await bodyText(),
    });
  } catch {
    findings.push({ step: 'scenes-failed' });
  }

  // Characters nav briefly
  try {
    await page.locator('button, a, [role="button"]').filter({ hasText: /^Characters$/i }).first().click({ timeout: 5_000 });
    await sleep(1500);
    findings.push({
      step: 'characters',
      screenshot: await shot('flow-gen-characters'),
      body: (await bodyText()).slice(0, 1500),
    });
  } catch {
    findings.push({ step: 'characters-skipped' });
  }

  const joined = findings.map((f) => f.body || '').join('\n');
  const availability = {
    mentions6s: /\b6\s*s(ec)?\b|6 seconds/i.test(joined),
    mentions720: /720/i.test(joined),
    mentionsDuration: /duration|seconds|sec\b/i.test(joined),
    mentionsResolution: /resolution|720p|1080p|4k/i.test(joined),
    mentionsOmni: /Omni/i.test(joined),
    mentionsVeo: /Veo/i.test(joined),
  };

  const reportPath = join(outDir, `flow-costs-scenes-inspect-${Date.now()}.json`);
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: 'COSTS_SCENES_INSPECT_NO_GENERATE',
        availability,
        findings: findings.map((f) => ({
          step: f.step,
          screenshot: f.screenshot,
          bodySnippet: (f.body || '').slice(0, 2000),
        })),
        generateClicked: false,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(JSON.stringify({ reportPath, availability, steps: findings.map((f) => f.step) }, null, 2));
} finally {
  await context.close();
}
