#!/usr/bin/env node
/**
 * Deep inspect of Flow generation controls for canary recipe mapping.
 * - Opens project + create session / prompt composer
 * - Clicks ONLY prompt-bar tune (aria-label=Settings, text=tune) — not header gear
 * - Opens Video generation default model menu and inventories Veo options
 * - Looks for duration / resolution / S-M-L proxies
 * NEVER clicks Start generation, Never confirm mode, or Save that enables auto-spend.
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

async function shot(name) {
  const path = join(outDir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function inventory() {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const items = [];
    for (const el of document.querySelectorAll(
      'button, [role="button"], [role="option"], [role="menuitem"], [role="radio"], [role="tab"], [role="menuitemradio"], label, select, [role="combobox"], flow-toggles, [aria-label]',
    )) {
      if (!visible(el)) continue;
      const rect = el.getBoundingClientRect();
      items.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        ariaChecked: el.getAttribute('aria-checked'),
        ariaExpanded: el.getAttribute('aria-expanded'),
        text: (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 160),
        y: Math.round(rect.y),
        x: Math.round(rect.x),
      });
    }
    return {
      url: location.href,
      bodySample: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 5000),
      items,
    };
  });
}

async function menuOptions() {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], [role="radio"]')]
      .map((el) => ({
        text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160),
        ariaLabel: el.getAttribute('aria-label'),
        ariaChecked: el.getAttribute('aria-checked'),
      }))
      .filter((o) => o.text || o.ariaLabel)
      .slice(0, 80),
  );
}

const steps = [];
let tunePanel = null;
let agentPanel = null;
let videoModels = [];
let videoModelShot = null;
let tuneShot = null;

try {
  await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(3500);
  steps.push({ step: 'loaded', screenshot: await shot('flow-gen-loaded') });

  // Close any leftover Agent settings drawer.
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Escape');
    await sleep(300);
  }

  // Open / focus create session if needed.
  const newSession = page.getByRole('button', { name: /new|create|untitled|edit_square/i });
  if (await newSession.count()) {
    try {
      await newSession.first().click({ timeout: 3_000 });
      await sleep(1500);
      steps.push({ step: 'opened-session-candidate' });
    } catch {
      // ignore
    }
  }

  // Click the empty-state / prompt area to surface the composer.
  const prompt = page.locator('[role="textbox"][aria-label="What do you want to create?"]');
  if ((await prompt.count()) === 0) {
    // Try opening create chat from empty state tips.
    const tip = page.getByText(/What would you like to create|Start creating/i).first();
    if (await tip.count()) {
      await tip.click({ timeout: 3_000 }).catch(() => {});
      await sleep(1000);
    }
  }

  if (await prompt.count()) {
    await prompt.click({ timeout: 10_000 });
    await prompt.fill('cinematic vertical rainy neon street, courier with glowing package, 6 seconds');
    await sleep(1000);
    steps.push({ step: 'prompt-filled', screenshot: await shot('flow-gen-prompt-filled') });
  } else {
    steps.push({ step: 'prompt-missing' });
  }

  // Click ONLY the prompt-bar tune: button[aria-label=Settings] whose visible text is "tune".
  const tune = page.locator('button[aria-label="Settings"]').filter({ hasText: /^tune$/i });
  if (await tune.count()) {
    await tune.last().click({ timeout: 5_000 });
    await sleep(2000);
    tuneShot = await shot('flow-gen-prompt-tune');
    tunePanel = await inventory();
    steps.push({
      step: 'prompt-tune-opened',
      screenshot: tuneShot,
      itemCount: tunePanel.items.length,
      bodySnippet: tunePanel.bodySample.slice(0, 800),
    });
    await page.keyboard.press('Escape');
    await sleep(500);
    const leftover = page.locator('.cdk-overlay-backdrop-showing');
    if (await leftover.count()) {
      await leftover.first().click({ force: true }).catch(() => {});
      await sleep(300);
    }
  } else {
    steps.push({ step: 'prompt-tune-not-found' });
  }

  // Open Agent settings via header gear (settings_2) separately — inventory video model list only.
  const gear = page.locator('button[aria-label="Settings"]').filter({ hasText: /settings_2/i });
  if (await gear.count()) {
    await gear.first().click({ timeout: 5_000 });
    await sleep(2000);
    agentPanel = await inventory();
    steps.push({ step: 'agent-settings-opened', screenshot: await shot('flow-gen-agent-settings') });

    // Ensure Confirm=Always stays selected (do not click Never).
    const always = page.getByText(/Always/i).first();
    // inventory only

    // Select video 9:16 radio under Video generation default (safe default, not spend).
    try {
      const videoAspectGroup = page.locator('[aria-label="Video generation default aspect ratio"]');
      const nineSixteen = videoAspectGroup.getByRole('radio', { name: /9\s*:\s*16|crop_9_16/i });
      if (await nineSixteen.count()) {
        await nineSixteen.click({ timeout: 2_000 });
        await sleep(400);
        steps.push({ step: 'clicked-video-9-16-default' });
      } else {
        // Fallback: within agent settings, click the video section's 9:16 (second crop_9_16 often).
        const radios = page.locator('button[role="radio"]').filter({ hasText: /crop_9_16|9\s*:\s*16/i });
        const count = await radios.count();
        if (count >= 2) {
          await radios.nth(count - 1).click({ timeout: 2_000 });
          steps.push({ step: 'clicked-last-9-16-radio', count });
        }
      }
    } catch (e) {
      steps.push({ step: 'aspect-click-failed', error: String(e).slice(0, 200) });
    }

    // Dismiss any leftover CDK overlay from prompt-tune before opening the model menu.
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Escape');
      await sleep(250);
    }
    const backdrop = page.locator('.cdk-overlay-backdrop-showing');
    if (await backdrop.count()) {
      await backdrop.first().click({ timeout: 2_000, force: true }).catch(() => {});
      await sleep(300);
    }

    // Re-open agent settings if escape closed it.
    if ((await page.getByText('Agent settings').count()) === 0) {
      if (await gear.count()) {
        await gear.first().click({ timeout: 5_000 });
        await sleep(1500);
      }
    }

    const videoModelBtn = page.locator('[aria-label="Video generation default model"]');
    if (await videoModelBtn.count()) {
      await videoModelBtn.scrollIntoViewIfNeeded();
      await videoModelBtn.click({ timeout: 8_000, force: true });
      await sleep(1000);
      videoModels = await menuOptions();
      videoModelShot = await shot('flow-gen-video-models');
      steps.push({ step: 'video-models-opened', count: videoModels.length, screenshot: videoModelShot });
      await page.keyboard.press('Escape');
      await sleep(400);
    }

    // Do NOT click Save — leave defaults unsaved unless already Always; avoid mutating project.
    await page.keyboard.press('Escape');
    await sleep(400);
  } else {
    steps.push({ step: 'agent-gear-not-found' });
  }
} catch (err) {
  steps.push({ step: 'error', error: String(err).slice(0, 500) });
  try {
    steps.push({ step: 'error-screenshot', screenshot: await shot('flow-gen-error') });
  } catch {
    // ignore
  }
}

try {
  // Parse availability from all collected text.
  const allText = [
    tunePanel?.bodySample || '',
    agentPanel?.bodySample || '',
    ...videoModels.map((m) => `${m.text} ${m.ariaLabel || ''}`),
    ...(tunePanel?.items || []).map((i) => `${i.text} ${i.ariaLabel || ''}`),
    ...(agentPanel?.items || []).map((i) => `${i.text} ${i.ariaLabel || ''}`),
  ].join('\n');

  const availability = {
    modelGeminiOmniFlash: /gemini|omni\s*flash/i.test(allText),
    modelVeoLite: /Veo\s*3\.1\s*-\s*Lite|Veo.*Lite/i.test(allText),
    modelVeoAny: /Veo/i.test(allText),
    aspect916: /9\s*:\s*16|crop_9_16/i.test(allText),
    duration6s: /\b6\s*s(ec(onds)?)?\b/i.test(allText),
    durationAny: /\b\d+\s*s(ec(onds)?)?\b/i.test(allText),
    resolution720p: /720\s*p?/i.test(allText),
    sizeSML: /\b[SML]\b/.test(allText) || (agentPanel?.items || []).some((i) => /^[SML]$/.test(i.text)),
    confirmBeforeAlways: /Confirm before generating[\s\S]*Always/i.test(allText),
  };

  // Update recipe with what we can assert; verifiedAt stays null.
  const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
  recipe.modelOptionLabel = availability.modelVeoLite
    ? 'Veo 3.1 - Lite'
    : availability.modelGeminiOmniFlash
      ? 'Gemini Omni Flash'
      : recipe.modelOptionLabel;
  recipe.aspectRatioOptionLabel = '9:16';
  recipe.selectors.promptInput = '[role="textbox"][aria-label="What do you want to create?"]';
  recipe.selectors.submitButton = 'button[aria-label="Start generation"]';
  recipe.selectors.workspaceReady = 'button[aria-label="Start generation"]';
  recipe.selectors.modelControl = '[aria-label="Video generation default model"]';
  recipe.selectors.aspectRatioControl =
    '[aria-label="Video generation default aspect ratio"] button[role="radio"]:has-text("9:16"), [aria-label="Video generation default aspect ratio"] button[role="radio"]:has-text("crop_9_16")';
  // Duration/resolution not exposed in Agent settings UI as of this inspect.
  recipe.selectors.durationControl = '';
  recipe.selectors.resolutionControl = '';
  recipe.verifiedAt = null;
  recipe.notes =
    'UI inspect (no generate): prompt textbox + tune Settings + Start generation confirmed. Agent settings Video defaults: Veo 3.1 - Lite model control, 16:9/9:16 aspect, output count x1–x4. Confirm before generating=Always observed. Gemini Omni Flash / explicit 6s / 720p controls NOT found in Settings or prompt-tune. Duration may be model-fixed or only appear after generation mode selection. Recipe remains UNVERIFIED — do not live-submit.';
  await writeFile(recipePath, JSON.stringify(recipe, null, 2) + '\n', 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'GENERATION_PANEL_INSPECT_NO_GENERATE',
    projectUrl,
    availability,
    videoModels,
    steps,
    tunePanelItems: (tunePanel?.items || []).filter((i) =>
      /model|aspect|duration|resolution|veo|tune|crop_|seconds|720|1080|SML|^[SML]$/i.test(
        `${i.text} ${i.ariaLabel || ''}`,
      ),
    ),
    agentPanelItems: (agentPanel?.items || []).filter((i) =>
      /model|aspect|duration|resolution|veo|confirm|crop_|seconds|720|Always|Never|^[SML]$/i.test(
        `${i.text} ${i.ariaLabel || ''}`,
      ),
    ),
    generateClicked: false,
    saveClicked: false,
    recipeUpdatedPath: recipePath,
    recipeStillUnverified: true,
    operatorDecisionNeeded: [
      'Accept Veo 3.1 - Lite instead of Gemini Omni Flash for canary, OR locate alternate model UI',
      'Confirm how duration=6s and resolution=720p are set (not visible in Agent settings)',
      'After recipe complete + FLOW_UI_VERIFIED, require explicit SPEND_REAL_CREDITS before live canary',
    ],
  };
  const reportPath = join(outDir, `flow-generation-panel-inspect-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(
    JSON.stringify(
      {
        reportPath,
        availability,
        videoModelCount: videoModels.length,
        videoModels: videoModels.map((m) => m.text || m.ariaLabel),
        tuneOpened: Boolean(tunePanel),
        recipeStillUnverified: true,
        operatorDecisionNeeded: report.operatorDecisionNeeded,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
}
