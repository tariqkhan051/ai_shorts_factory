#!/usr/bin/env node
/**
 * Open Flow project, focus prompt bar, open the prompt-adjacent "tune" panel
 * (not Agent settings gear), inventory model/duration/aspect/resolution.
 * NEVER clicks Start generation / arrow_forward submit.
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

async function visibleInventory() {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const items = [];
    for (const el of document.querySelectorAll(
      'button, [role="button"], [role="option"], [role="menuitem"], [role="radio"], [role="tab"], label, select, [role="combobox"], [role="listbox"], [role="textbox"], textarea, input, [aria-label]',
    )) {
      if (!visible(el)) continue;
      items.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        ariaChecked: el.getAttribute('aria-checked'),
        ariaPressed: el.getAttribute('aria-pressed'),
        ariaExpanded: el.getAttribute('aria-expanded'),
        text: (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 160),
      });
    }
    return {
      url: location.href,
      bodySample: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 4500),
      items: items.slice(0, 300),
    };
  });
}

async function captureOptions() {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="option"], [role="menuitem"], [role="radio"], [role="menuitemradio"]')]
      .map((el) => ({
        text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120),
        ariaLabel: el.getAttribute('aria-label'),
        ariaChecked: el.getAttribute('aria-checked'),
      }))
      .filter((o) => o.text || o.ariaLabel)
      .slice(0, 60),
  );
}

try {
  await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(3500);

  // Ensure prompt composer is focused / visible.
  const prompt = page.locator('[role="textbox"][aria-label="What do you want to create?"]');
  if (await prompt.count()) {
    await prompt.click({ timeout: 10_000 });
    await sleep(800);
  }

  // Prefer the prompt-bar tune control (Material icon text "tune"), never Start generation.
  const tuneCandidates = [
    page.locator('button').filter({ hasText: /^tune$/i }).last(),
    page.getByRole('button', { name: /tune/i }).last(),
    page.locator('[aria-label*="tune" i]').last(),
    page.locator('button[aria-label*="Settings" i]').filter({ hasText: /tune/i }).last(),
  ];

  let tuneOpened = false;
  for (const loc of tuneCandidates) {
    try {
      if ((await loc.count()) === 0) continue;
      const label = ((await loc.getAttribute('aria-label')) || '') + ' ' + ((await loc.innerText()) || '');
      if (/start generation|generate/i.test(label)) continue;
      await loc.click({ timeout: 3_000 });
      tuneOpened = true;
      break;
    } catch {
      // try next
    }
  }
  await sleep(2000);

  const afterTuneShot = join(outDir, `flow-prompt-tune-${Date.now()}.png`);
  await page.screenshot({ path: afterTuneShot, fullPage: true });
  const panel = await visibleInventory();

  // Probe dropdowns that look like model / duration / resolution / aspect — never submit.
  const safeLabels = [/model/i, /veo/i, /aspect/i, /ratio/i, /duration/i, /seconds/i, /resolution/i, /outputs/i, /quality/i, /crop_/i, /\d+\s*s/i, /720|1080/i];
  const probed = panel.items.filter((item) => {
    const hay = `${item.text || ''} ${item.ariaLabel || ''}`;
    if (/start generation|generate|create video|arrow_forward/i.test(hay)) return false;
    return safeLabels.some((re) => re.test(hay));
  });

  const optionSnapshots = [];
  for (const item of probed.slice(0, 12)) {
    try {
      const locator = item.ariaLabel
        ? page.locator(`[aria-label="${item.ariaLabel}"]`).first()
        : page.getByText(item.text, { exact: false }).first();
      await locator.click({ timeout: 2_500 });
      await sleep(900);
      const options = await captureOptions();
      optionSnapshots.push({ control: item, options });
      await page.keyboard.press('Escape');
      await sleep(350);
    } catch {
      // ignore
    }
  }

  // Also try opening Video generation default model from Agent settings if still needed.
  let agentVideoModels = [];
  try {
    await page.keyboard.press('Escape');
    await sleep(400);
    const gear = page.locator('button[aria-label="Settings"]').first();
    if (await gear.count()) {
      await gear.click({ timeout: 5_000 });
      await sleep(1500);
      const videoModelBtn = page.locator('[aria-label="Video generation default model"]');
      if (await videoModelBtn.count()) {
        await videoModelBtn.click({ timeout: 3_000 });
        await sleep(900);
        agentVideoModels = await captureOptions();
        const agentShot = join(outDir, `flow-agent-video-models-${Date.now()}.png`);
        await page.screenshot({ path: agentShot, fullPage: true });
        optionSnapshots.push({
          control: { ariaLabel: 'Video generation default model', source: 'agent-settings' },
          options: agentVideoModels,
          screenshotPath: agentShot,
        });
        await page.keyboard.press('Escape');
      }
      // Set video aspect 9:16 visually without Save if possible — only inventory, do not Save.
      const aspectBtn = page.locator('button, [role="button"]').filter({ hasText: /9\s*:\s*16|crop_9_16/i });
      // inventory only
      void aspectBtn;
    }
  } catch {
    // agent settings probe optional
  }

  const flatTexts = optionSnapshots.flatMap((s) =>
    s.options.map((o) => (typeof o === 'string' ? o : `${o.text || ''} ${o.ariaLabel || ''}`)),
  );
  const availability = {
    modelGeminiOmniFlash: flatTexts.some((t) => /omni|gemini.*flash|flash/i.test(t)) || /gemini.*omni|omni.*flash/i.test(panel.bodySample),
    modelVeo: flatTexts.some((t) => /veo/i.test(t)) || /veo/i.test(panel.bodySample),
    aspect916: flatTexts.some((t) => /9\s*:\s*16|crop_9_16/i.test(t)) || /9\s*:\s*16|crop_9_16/i.test(panel.bodySample),
    duration6s: flatTexts.some((t) => /\b6\s*s\b/i.test(t)) || /\b6\s*s\b/i.test(panel.bodySample),
    resolution720p: flatTexts.some((t) => /720/i.test(t)) || /720/i.test(panel.bodySample),
    confidence: optionSnapshots.length > 0 || tuneOpened ? 'PROBED_UI' : 'PARTIAL_DOM_ONLY',
  };

  // Partial recipe update: keep verifiedAt null; fill only confirmed entry points.
  const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
  recipe.notes =
    'Partial UI map from authenticated inspect. Agent settings: video default Veo 3.1 - Lite + 9:16 available; Confirm before generating=Always. Prompt bar: textbox + tune + Start generation. Duration/resolution/Gemini Omni Flash not confirmed in UI. Do NOT set verifiedAt or click Start generation until operator approves canary spend.';
  recipe.selectors = {
    ...recipe.selectors,
    promptInput: '[role="textbox"][aria-label="What do you want to create?"]',
    submitButton: 'button[aria-label="Start generation"]',
    workspaceReady: 'button[aria-label="Start generation"]',
    loginRequired: 'text=Sign in',
    captchaOrChallenge: 'text=unusual traffic',
    // Confirmed agent-settings controls (defaults), not per-generation yet:
    modelControl: '[aria-label="Video generation default model"]',
    aspectRatioControl: '', // 9:16 present as crop_9_16 buttons under Video generation default — selector TBD after stable aria
    durationControl: '',
    resolutionControl: '',
    resultReady: '',
    downloadButton: '',
  };
  if (availability.modelVeo && !availability.modelGeminiOmniFlash) {
    recipe.modelOptionLabel = 'Veo 3.1 - Lite';
    recipe.notes += ' Target model label updated to observed Veo 3.1 - Lite (Gemini Omni Flash not present in probed menus).';
  }
  recipe.aspectRatioOptionLabel = '9:16';
  await writeFile(recipePath, JSON.stringify(recipe, null, 2) + '\n', 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'PROMPT_TUNE_INSPECT_NO_GENERATE',
    projectUrl,
    tuneOpened,
    screenshotPath: afterTuneShot,
    availability,
    probedControls: probed,
    optionSnapshots,
    agentVideoModels,
    bodySample: panel.bodySample,
    generateClicked: false,
    recipeUpdatedPath: recipePath,
    recipeStillUnverified: true,
    missingForLiveSubmit: [
      ...(availability.duration6s ? [] : ['durationControl / 6s option']),
      ...(availability.resolution720p ? [] : ['resolutionControl / 720p option']),
      ...(availability.modelGeminiOmniFlash || availability.modelVeo ? [] : ['model option']),
      'resultReady',
      'downloadButton',
      'verifiedAt',
    ],
  };
  const reportPath = join(outDir, `flow-prompt-tune-inspect-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(
    JSON.stringify(
      {
        reportPath,
        screenshotPath: afterTuneShot,
        tuneOpened,
        availability,
        optionSnapshotCount: optionSnapshots.length,
        agentVideoModelCount: agentVideoModels.length,
        recipeStillUnverified: true,
        missingForLiveSubmit: report.missingForLiveSubmit,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
}
