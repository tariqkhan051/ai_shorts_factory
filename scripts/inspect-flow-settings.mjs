#!/usr/bin/env node
/**
 * Open an existing Flow project (or create one), open Settings/tune panel,
 * inventory model/duration/aspect options. NEVER clicks Start generation.
 */
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
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
const recipePath = join(root, 'packages/flow-adapter/recipes/google-flow.unverified.json');

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

try {
  await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(4000);

  // Open prompt settings (tune) — not Start generation.
  const tune = page.locator('button[aria-label="Settings"]').filter({ hasText: /tune/i }).last();
  if (await tune.count()) {
    await tune.click({ timeout: 10_000 });
  } else {
    await page.getByRole('button', { name: /^settings$/i }).last().click({ timeout: 10_000 });
  }
  await sleep(2500);

  const screenshotPath = join(outDir, `flow-settings-${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const panel = await page.evaluate(() => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const items = [];
    for (const el of document.querySelectorAll(
      'button, [role="button"], [role="option"], [role="menuitem"], [role="radio"], [role="tab"], label, select, [role="combobox"], [role="listbox"], [role="textbox"], textarea, input',
    )) {
      if (!visible(el)) continue;
      items.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        ariaChecked: el.getAttribute('aria-checked'),
        ariaPressed: el.getAttribute('aria-pressed'),
        text: (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 120),
      });
    }
    return {
      url: location.href,
      bodySample: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 3500),
      items: items.slice(0, 250),
    };
  });

  // Probe labeled dropdowns by clicking safe settings-like controls (not Start generation).
  const probed = [];
  const safeLabels = [/model/i, /aspect/i, /ratio/i, /duration/i, /seconds/i, /resolution/i, /outputs/i, /quality/i];
  for (const item of panel.items) {
    const hay = `${item.text || ''} ${item.ariaLabel || ''}`;
    if (!safeLabels.some((re) => re.test(hay))) continue;
    if (/start generation|generate|create video/i.test(hay)) continue;
    probed.push(item);
  }

  // Try opening each probed control once and capture options.
  const optionSnapshots = [];
  for (const item of probed.slice(0, 8)) {
    try {
      const locator = item.ariaLabel
        ? page.locator(`[aria-label="${item.ariaLabel}"]`).first()
        : page.getByText(item.text, { exact: false }).first();
      await locator.click({ timeout: 2_000 });
      await sleep(800);
      const options = await page.evaluate(() =>
        [...document.querySelectorAll('[role="option"], [role="menuitem"], [role="radio"]')]
          .map((el) => (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '))
          .filter(Boolean)
          .slice(0, 40),
      );
      optionSnapshots.push({ control: item, options });
      await page.keyboard.press('Escape');
      await sleep(400);
    } catch {
      // ignore individual probe failures
    }
  }

  const proposedSelectors = {
    promptInput: '[role="textbox"][aria-label="What do you want to create?"]',
    submitButton: 'button[aria-label="Start generation"]',
    workspaceReady: 'button[aria-label="Start generation"]',
    loginRequired: 'text=/Sign in|Choose an account/i',
    captchaOrChallenge: 'text=/unusual traffic|verify you|captcha/i',
    // Settings entry point; exact model/duration/resolution controls filled after probes.
    settingsButton: 'button[aria-label="Settings"]',
  };

  const flatOptions = optionSnapshots.flatMap((s) => s.options);
  const models = flatOptions.filter((o) => /gemini|veo|imagen|flash|pro|ultra|model/i.test(o));
  const aspects = flatOptions.filter((o) => /9:16|16:9|1:1|portrait|landscape|vertical|horizontal/i.test(o));
  const durations = flatOptions.filter((o) => /\d+\s*s(ec)?/i.test(o) || /duration/i.test(o));
  const resolutions = flatOptions.filter((o) => /720|1080|4k|resolution|p\b/i.test(o));

  const availability = {
    modelGeminiOmniFlash:
      models.some((m) => /omni|flash|gemini/i.test(m)) || /gemini|omni|flash/i.test(panel.bodySample),
    aspect916: aspects.some((a) => /9\s*:\s*16|portrait|vertical/i.test(a)) || /9\s*:\s*16|portrait|vertical/i.test(panel.bodySample),
    duration6s: durations.some((d) => /\b6\b/.test(d)) || /\b6\s*s/i.test(panel.bodySample),
    resolution720p: resolutions.some((r) => /720/i.test(r)) || /720/i.test(panel.bodySample),
    confidence: optionSnapshots.length > 0 ? 'PROBED_UI' : 'PARTIAL_DOM_ONLY',
  };

  // Update recipe with confirmed prompt/submit/workspace selectors; leave unverifiedAt until operator confirms options.
  const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
  recipe.baseUrl = 'https://flow.google.com/';
  recipe.notes =
    'Selectors partially filled from authenticated UI inspection. Model/duration/resolution/aspect controls require Settings panel confirmation. Do not click Start generation until canary execute is approved. Project used for inspect: ASF Canary Inspect.';
  recipe.selectors = {
    ...recipe.selectors,
    promptInput: proposedSelectors.promptInput,
    submitButton: proposedSelectors.submitButton,
    workspaceReady: proposedSelectors.workspaceReady,
    loginRequired: 'text=Sign in',
    captchaOrChallenge: 'text=unusual traffic',
    // Keep empty until exact settings controls are confirmed:
    modelControl: recipe.selectors.modelControl || '',
    durationControl: recipe.selectors.durationControl || '',
    resolutionControl: recipe.selectors.resolutionControl || '',
    aspectRatioControl: recipe.selectors.aspectRatioControl || '',
    resultReady: recipe.selectors.resultReady || '',
    downloadButton: recipe.selectors.downloadButton || '',
    creditCostBadge: recipe.selectors.creditCostBadge || '',
  };
  // Intentionally do NOT set verifiedAt — recipe still incomplete for full live submit.
  await writeFile(recipePath, JSON.stringify(recipe, null, 2) + '\n', 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'SETTINGS_INSPECT_NO_GENERATE',
    projectUrl,
    screenshotPath,
    proposedSelectors,
    probedControls: probed,
    optionSnapshots,
    availability,
    bodySample: panel.bodySample,
    generateClicked: false,
    recipeUpdatedPath: recipePath,
    recipeStillUnverified: true,
    missingForLiveSubmit: [
      'modelControl',
      'durationControl',
      'resolutionControl',
      'aspectRatioControl (optional but intended)',
      'resultReady',
      'downloadButton',
      'verifiedAt',
    ],
  };
  const reportPath = join(outDir, `flow-settings-inspect-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(
    JSON.stringify(
      {
        reportPath,
        screenshotPath,
        availability,
        optionSnapshotCount: optionSnapshots.length,
        recipeStillUnverified: true,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
}
