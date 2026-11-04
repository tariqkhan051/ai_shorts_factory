#!/usr/bin/env node
/**
 * Open Flow project → Scenes → open model/status pills (Video · 720p · 8s).
 * Inventory duration/resolution/aspect/model menus. NEVER clicks Start generation.
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
    return [...document.querySelectorAll('button, [role="button"], [role="option"], [role="menuitem"], [role="radio"], [role="menuitemradio"], [aria-label], flow-toggles')]
      .filter(visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          ariaLabel: el.getAttribute('aria-label'),
          ariaExpanded: el.getAttribute('aria-expanded'),
          ariaHaspopup: el.getAttribute('aria-haspopup'),
          text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 200),
          y: Math.round(rect.y),
          x: Math.round(rect.x),
        };
      })
      .slice(0, 350);
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
let items = [];
const optionSnapshots = [];

try {
  await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(3500);
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Escape');
    await sleep(200);
  }
  steps.push({ step: 'loaded', screenshot: await shot('flow-scenes-loaded') });

  // Navigate to Scenes (matches operator screenshot).
  const scenesNav = page.locator('button, a, [role="button"], [role="tab"]').filter({ hasText: /^Scenes$/i });
  if (await scenesNav.count()) {
    await scenesNav.first().click({ timeout: 8_000 });
    await sleep(2500);
    steps.push({ step: 'scenes-opened', screenshot: await shot('flow-scenes-tab') });
  } else {
    steps.push({ step: 'scenes-nav-missing' });
  }

  // Focus / ensure composer prompt is present.
  let prompt = page.locator('[role="textbox"][aria-label="What do you want to create?"]');
  if ((await prompt.count()) === 0) {
    // Try creating a scene / start creating.
    const start = page.getByText(/Start creating|New scene|Add scene/i).first();
    if (await start.count()) {
      await start.click({ timeout: 5_000 }).catch(() => {});
      await sleep(1500);
    }
  }
  prompt = page.locator('[role="textbox"][aria-label="What do you want to create?"]');
  if (await prompt.count()) {
    await prompt.click({ timeout: 8_000 });
    await prompt.fill('cinematic vertical rainy neon street, courier with glowing package');
    await sleep(1200);
    steps.push({ step: 'prompt-filled', screenshot: await shot('flow-scenes-prompt') });
  }

  items = await inventory();

  // Find status / settings pills mentioning Video, 720p, 8s, model.
  const pillCandidates = items.filter((it) => {
    const hay = `${it.text || ''} ${it.ariaLabel || ''}`;
    if (/start generation|generate|arrow_forward/i.test(hay)) return false;
    return /video|720|1080|^\d+\s*s\b|\b8\s*s\b|\b6\s*s\b|veo|omni|aspect|resolution|duration|crop_/i.test(hay);
  });
  steps.push({ step: 'pill-candidates', count: pillCandidates.length, sample: pillCandidates.slice(0, 20) });

  // Click each candidate once and capture menus (never submit).
  for (const cand of pillCandidates.slice(0, 15)) {
    try {
      await page.keyboard.press('Escape');
      await sleep(250);
      const loc = cand.ariaLabel
        ? page.locator(`[aria-label="${cand.ariaLabel}"]`).first()
        : page.getByRole('button', { name: new RegExp(cand.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 40), 'i') }).first();
      if ((await loc.count()) === 0) continue;
      await loc.click({ timeout: 3_000 });
      await sleep(900);
      const options = await menuOptions();
      const screenshot = await shot(`flow-scenes-pill-${optionSnapshots.length}`);
      optionSnapshots.push({ control: cand, options, screenshot });
      await page.keyboard.press('Escape');
      await sleep(300);
    } catch (e) {
      optionSnapshots.push({ control: cand, error: String(e).slice(0, 200) });
    }
  }

  // Also click any button whose text looks like the status chip "Video · 720p · 8s".
  const statusChip = page.locator('button, [role="button"]').filter({ hasText: /Video.*720|720p|8\s*s|6\s*s/i });
  if (await statusChip.count()) {
    for (let i = 0; i < Math.min(await statusChip.count(), 4); i++) {
      try {
        await page.keyboard.press('Escape');
        await sleep(200);
        await statusChip.nth(i).click({ timeout: 3_000 });
        await sleep(900);
        const options = await menuOptions();
        const screenshot = await shot(`flow-scenes-statuschip-${i}`);
        const text = (await statusChip.nth(i).innerText()).trim().replace(/\s+/g, ' ');
        const ariaLabel = await statusChip.nth(i).getAttribute('aria-label');
        optionSnapshots.push({
          control: { text, ariaLabel, source: 'statuschip' },
          options,
          screenshot,
        });
        await page.keyboard.press('Escape');
      } catch {
        // ignore
      }
    }
  }

  const flat = optionSnapshots.flatMap((s) =>
    (s.options || []).map((o) => `${o.text || ''} ${o.ariaLabel || ''}`),
  );
  const body = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 5000));
  const allText = [body, ...flat, ...items.map((i) => `${i.text} ${i.ariaLabel || ''}`)].join('\n');

  const availability = {
    duration6s: /\b6\s*s\b/i.test(allText),
    duration8s: /\b8\s*s\b/i.test(allText),
    durationAny: /\b\d+\s*s\b/i.test(allText),
    resolution720p: /720\s*p?/i.test(allText),
    resolution1080p: /1080/i.test(allText),
    modelVeoLite: /Veo\s*3\.1\s*-\s*Lite/i.test(allText),
    aspect916: /9\s*:\s*16|crop_9_16/i.test(allText),
  };

  // Propose selectors from controls that opened useful menus.
  const proposed = {
    durationControl: '',
    resolutionControl: '',
    modelControl: '',
    aspectRatioControl: '',
  };
  for (const snap of optionSnapshots) {
    const optText = (snap.options || []).map((o) => o.text || '').join(' ');
    const ctrl = `${snap.control?.ariaLabel || ''} ${snap.control?.text || ''}`;
    if (!proposed.durationControl && /\b\d+\s*s\b/i.test(optText)) {
      proposed.durationControl = snap.control?.ariaLabel
        ? `[aria-label="${snap.control.ariaLabel}"]`
        : `button:has-text("${(snap.control?.text || '').slice(0, 40)}")`;
    }
    if (!proposed.resolutionControl && /720|1080/i.test(optText)) {
      proposed.resolutionControl = snap.control?.ariaLabel
        ? `[aria-label="${snap.control.ariaLabel}"]`
        : `button:has-text("${(snap.control?.text || '').slice(0, 40)}")`;
    }
    if (!proposed.modelControl && /Veo|Omni/i.test(optText)) {
      proposed.modelControl = snap.control?.ariaLabel
        ? `[aria-label="${snap.control.ariaLabel}"]`
        : `[aria-label="Video generation default model"]`;
    }
    if (!proposed.aspectRatioControl && /9\s*:\s*16|16\s*:\s*9|crop_/i.test(optText + ctrl)) {
      proposed.aspectRatioControl =
        snap.control?.ariaLabel && /aspect/i.test(snap.control.ariaLabel)
          ? `[aria-label="${snap.control.ariaLabel}"]`
          : proposed.aspectRatioControl;
    }
  }

  // Update recipe only with newly discovered non-empty selectors; keep verifiedAt null.
  const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
  recipe.modelOptionLabel = 'Veo 3.1 - Lite';
  recipe.aspectRatioOptionLabel = '9:16';
  if (proposed.durationControl) recipe.selectors.durationControl = proposed.durationControl;
  if (proposed.resolutionControl) recipe.selectors.resolutionControl = proposed.resolutionControl;
  if (proposed.modelControl) recipe.selectors.modelControl = proposed.modelControl;
  if (proposed.aspectRatioControl) recipe.selectors.aspectRatioControl = proposed.aspectRatioControl;
  recipe.notes =
    `Scenes composer inspect (no Generate). Status pill / model menus probed. availability=${JSON.stringify(availability)}. proposed=${JSON.stringify(proposed)}. Operator screenshot showed Video · 720p · 8s and 10 credits. Recipe still UNVERIFIED — resultReady/downloadButton require a real generation.`;
  recipe.verifiedAt = null;
  await writeFile(recipePath, JSON.stringify(recipe, null, 2) + '\n', 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'SCENES_COMPOSER_INSPECT_NO_GENERATE',
    projectUrl,
    availability,
    proposed,
    optionSnapshots,
    pillCandidates,
    generateClicked: false,
    recipeUpdatedPath: recipePath,
    recipeStillUnverified: true,
    missingForLiveSubmit: [
      ...(recipe.selectors.durationControl ? [] : ['durationControl']),
      ...(recipe.selectors.resolutionControl ? [] : ['resolutionControl']),
      'resultReady',
      'downloadButton',
      'verifiedAt',
    ],
  };
  const reportPath = join(outDir, `flow-scenes-composer-inspect-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(
    JSON.stringify(
      {
        reportPath,
        availability,
        proposed,
        optionSnapshotCount: optionSnapshots.length,
        missingForLiveSubmit: report.missingForLiveSubmit,
        recipeStillUnverified: true,
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
