#!/usr/bin/env node
/**
 * Scenes composer: open Settings trigger → switch to Video → inventory
 * model / 720p / duration menus. NEVER clicks Start generation.
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

async function menuOptions() {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], [role="radio"], button')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0;
      })
      .map((el) => ({
        text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160),
        ariaLabel: el.getAttribute('aria-label'),
        ariaChecked: el.getAttribute('aria-checked'),
        ariaExpanded: el.getAttribute('aria-expanded'),
        role: el.getAttribute('role'),
      }))
      .filter((o) => o.text || o.ariaLabel)
      .slice(0, 120),
  );
}

async function inventoryButtons() {
  return page.evaluate(() => {
    const visible = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0;
    };
    return [...document.querySelectorAll('button, [role="button"], [aria-label]')]
      .filter(visible)
      .map((el) => ({
        ariaLabel: el.getAttribute('aria-label'),
        text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 200),
        ariaExpanded: el.getAttribute('aria-expanded'),
        ariaHaspopup: el.getAttribute('aria-haspopup'),
      }))
      .slice(0, 250);
  });
}

const steps = [];
const snapshots = [];

try {
  await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(3500);
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Escape');
    await sleep(200);
  }

  const scenesNav = page.locator('button, a, [role="button"], [role="tab"]').filter({ hasText: /^Scenes$/i });
  if (await scenesNav.count()) {
    await scenesNav.first().click({ timeout: 8_000 });
    await sleep(2000);
  }

  const prompt = page.locator('[role="textbox"][aria-label="What do you want to create?"]');
  if (await prompt.count()) {
    await prompt.click({ timeout: 8_000 });
    await prompt.fill('cinematic vertical rainy neon street, courier with glowing package');
    await sleep(1000);
  }
  steps.push({ step: 'ready', screenshot: await shot('flow-video-mode-ready') });

  // Open composer settings trigger (shows Image/Video + aspect).
  const trigger = page.locator('button[aria-label="Settings trigger"]');
  if ((await trigger.count()) === 0) {
    throw new Error('Settings trigger not found');
  }
  await trigger.first().click({ timeout: 5_000 });
  await sleep(1000);
  steps.push({ step: 'settings-trigger-open', screenshot: await shot('flow-video-mode-settings-open') });

  // Switch to Video.
  const videoToggle = page.getByRole('radio', { name: /Video/i }).or(page.locator('[role="menuitemradio"], [role="radio"], button').filter({ hasText: /^videocam\s*Video$|^Video$/i }));
  // Prefer exact text match from prior inspect: "videocam Video"
  const videoBtn = page.locator('button, [role="radio"], [role="menuitemradio"]').filter({ hasText: /Video/i });
  let switched = false;
  const videoCount = await videoBtn.count();
  for (let i = 0; i < videoCount; i++) {
    const t = ((await videoBtn.nth(i).innerText()) || '').trim();
    if (/^videocam\s*Video$|^Video$/i.test(t.replace(/\s+/g, ' ')) || /videocam/i.test(t)) {
      await videoBtn.nth(i).click({ timeout: 3_000 });
      switched = true;
      break;
    }
  }
  if (!switched) {
    await page.getByText(/videocam\s*Video|Video/i).first().click({ timeout: 3_000 }).catch(() => {});
  }
  await sleep(1500);
  steps.push({ step: 'video-selected', switched, screenshot: await shot('flow-video-mode-selected') });

  // After switching to Video, the trigger text should become like "Video · 720p · 8s".
  // Re-open trigger if closed, then inventory.
  await page.keyboard.press('Escape');
  await sleep(400);
  await trigger.first().click({ timeout: 5_000 });
  await sleep(1200);
  const openMenuOptions = await menuOptions();
  snapshots.push({
    phase: 'video-settings-menu',
    options: openMenuOptions,
    screenshot: await shot('flow-video-mode-menu'),
  });

  // Click nested controls that look like model / resolution / duration.
  const nested = openMenuOptions.filter((o) =>
    /veo|omni|720|1080|^\d+\s*s\b|resolution|duration|model|Video ·|arrow_drop_down/i.test(
      `${o.text} ${o.ariaLabel || ''}`,
    ),
  );
  for (const item of nested.slice(0, 12)) {
    try {
      const loc = item.ariaLabel
        ? page.locator(`[aria-label="${item.ariaLabel}"]`).first()
        : page.getByText(item.text, { exact: false }).first();
      await loc.click({ timeout: 2_500 });
      await sleep(800);
      const options = await menuOptions();
      snapshots.push({
        phase: 'nested-click',
        control: item,
        options,
        screenshot: await shot(`flow-video-nested-${snapshots.length}`),
      });
      await page.keyboard.press('Escape');
      await sleep(300);
      // Re-open settings trigger for next probe.
      if ((await trigger.count()) && (await page.getByText(/Image|Video|720|Veo/i).count()) < 2) {
        await trigger.first().click({ timeout: 3_000 }).catch(() => {});
        await sleep(600);
      }
    } catch (e) {
      snapshots.push({ phase: 'nested-click-failed', control: item, error: String(e).slice(0, 180) });
    }
  }

  // Also try clicking the closed trigger text after video mode for pill parts.
  await page.keyboard.press('Escape');
  await sleep(400);
  const buttons = await inventoryButtons();
  const pillLike = buttons.filter((b) =>
    /720|1080|\d+\s*s|Veo|Omni|Video ·|Settings trigger/i.test(`${b.text} ${b.ariaLabel || ''}`),
  );
  steps.push({ step: 'pill-like-after-video', pillLike });

  for (const pill of pillLike.slice(0, 8)) {
    try {
      const loc = pill.ariaLabel
        ? page.locator(`[aria-label="${pill.ariaLabel}"]`).first()
        : page.locator('button').filter({ hasText: pill.text.slice(0, 30) }).first();
      await loc.click({ timeout: 2_500 });
      await sleep(800);
      snapshots.push({
        phase: 'pill-click',
        control: pill,
        options: await menuOptions(),
        screenshot: await shot(`flow-video-pill-${snapshots.length}`),
      });
      await page.keyboard.press('Escape');
      await sleep(300);
    } catch (e) {
      snapshots.push({ phase: 'pill-failed', control: pill, error: String(e).slice(0, 180) });
    }
  }

  const flat = snapshots.flatMap((s) => (s.options || []).map((o) => `${o.text || ''} ${o.ariaLabel || ''}`));
  const body = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 5000));
  const all = [body, ...flat, ...pillLike.map((p) => p.text)].join('\n');

  const availability = {
    duration6s: /\b6\s*s\b/i.test(all),
    duration8s: /\b8\s*s\b/i.test(all),
    durationAny: /\b\d+\s*s\b/i.test(all),
    durations: [...new Set((all.match(/\b\d+\s*s\b/gi) || []).map((x) => x.replace(/\s+/g, '')))],
    resolution720p: /720/i.test(all),
    resolution1080p: /1080/i.test(all),
    modelVeoLite: /Veo\s*3\.1\s*-\s*Lite/i.test(all),
    models: [...new Set((flat.join('\n').match(/Omni 1\.1 Flash|Veo 3\.1 - (?:Lite|Fast|Quality)/g) || []))],
  };

  // Selector proposals based on known aria-labels and observed controls.
  const proposed = {
    settingsTrigger: 'button[aria-label="Settings trigger"]',
    videoModeOption: 'text=Video',
    modelControl: '',
    durationControl: '',
    resolutionControl: '',
  };

  // Prefer aria-labels from clicked controls that exposed duration/resolution/model.
  for (const snap of snapshots) {
    const opt = (snap.options || []).map((o) => o.text || '').join(' ');
    const aria = snap.control?.ariaLabel || '';
    if (/Veo|Omni/i.test(opt) && aria) proposed.modelControl = `[aria-label="${aria}"]`;
    if (/\b\d+\s*s\b/i.test(opt) && aria) proposed.durationControl = `[aria-label="${aria}"]`;
    if (/720|1080/i.test(opt) && aria) proposed.resolutionControl = `[aria-label="${aria}"]`;
  }

  // If model options appear under settings menu without separate aria, keep agent settings model control as fallback.
  if (!proposed.modelControl && availability.modelVeoLite) {
    proposed.modelControl = 'button[aria-label="Settings trigger"]';
  }

  const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
  recipe.modelOptionLabel = 'Veo 3.1 - Lite';
  recipe.aspectRatioOptionLabel = '9:16';
  recipe.selectors.modelControl =
    proposed.modelControl || recipe.selectors.modelControl || '[aria-label="Video generation default model"]';
  if (proposed.durationControl) recipe.selectors.durationControl = proposed.durationControl;
  if (proposed.resolutionControl) recipe.selectors.resolutionControl = proposed.resolutionControl;
  // Keep aspect from agent settings / settings trigger flow.
  if (!recipe.selectors.aspectRatioControl) {
    recipe.selectors.aspectRatioControl = 'button[aria-label="Settings trigger"]';
  }
  recipe.verifiedAt = null;
  recipe.notes = `Scenes Video-mode inspect (no Generate). Settings trigger opens Image/Video composer. availability=${JSON.stringify(availability)}. proposed=${JSON.stringify(proposed)}. Still missing resultReady/downloadButton until a real generation exists.`;
  await writeFile(recipePath, JSON.stringify(recipe, null, 2) + '\n', 'utf8');

  const reportPath = join(outDir, `flow-scenes-video-mode-inspect-${Date.now()}.json`);
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: 'SCENES_VIDEO_MODE_INSPECT_NO_GENERATE',
        availability,
        proposed,
        steps,
        snapshots,
        generateClicked: false,
        recipeStillUnverified: true,
        missingForLiveSubmit: [
          ...(recipe.selectors.durationControl ? [] : ['durationControl']),
          ...(recipe.selectors.resolutionControl ? [] : ['resolutionControl']),
          'resultReady',
          'downloadButton',
          'verifiedAt',
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(
    JSON.stringify(
      {
        reportPath,
        availability,
        proposed,
        snapshotCount: snapshots.length,
        missingForLiveSubmit: [
          ...(recipe.selectors.durationControl ? [] : ['durationControl']),
          ...(recipe.selectors.resolutionControl ? [] : ['resolutionControl']),
          'resultReady',
          'downloadButton',
          'verifiedAt',
        ],
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(JSON.stringify({ error: String(err), steps }, null, 2));
  process.exitCode = 1;
} finally {
  await context.close();
}
