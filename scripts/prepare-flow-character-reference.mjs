#!/usr/bin/env node
/**
 * Create a character reference image INSIDE Google Flow (Image mode — typically 0 credits),
 * then leave it in the project library for later Ingredients reuse.
 *
 * Does NOT run Video Generate / does not spend video credits.
 * Refuses if FLOW_EXECUTE_LIVE=true (use live-canary separately after library has the asset).
 *
 * Flow:
 *  1. Open project
 *  2. If library already has a matching asset → stop (reuse later)
 *  3. Else: Settings → Image → generate character sheet → wait for library tile
 */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'packages/flow-adapter/package.json'));
const playwright = require('playwright');

if (process.env.FLOW_EXECUTE_LIVE === 'true') {
  console.error(
    JSON.stringify({
      error:
        'Refusing: FLOW_EXECUTE_LIVE=true. This script only prepares a free Flow Image reference. Unset FLOW_EXECUTE_LIVE and run again.',
    }),
  );
  process.exit(1);
}

const profileDir =
  process.env.FLOW_BROWSER_PROFILE_DIR?.trim() || join(root, '.flow-profile');
const projectUrl =
  process.env.FLOW_PROJECT_URL?.trim() ||
  'https://flow.google.com/project/cd052117-55ba-426e-a396-9eb70d48dbfa';
const channel = process.env.FLOW_BROWSER_CHANNEL?.trim() || 'chrome';
const outDir = join(root, 'diagnostic-screenshots', 'canary');
const characterName = process.env.FLOW_CHARACTER_NAME?.trim() || 'Rina';
const libraryMatch =
  process.env.FLOW_CHARACTER_LIBRARY_MATCH?.trim() ||
  'rina-courier-reference|CHARACTER REFERENCE|Rina|night courier';
const imagePrompt =
  process.env.FLOW_CHARACTER_IMAGE_PROMPT?.trim() ||
  `Character reference sheet for consistent video generation. Young woman night courier named ${characterName}: short black hair, amber weather jacket, dark pants, boots, courier satchel, determined eyes, rain-specked face. Clean studio background, full-body front view, photoreal cinematic lighting, label text "${characterName} — night courier", no watermark.`;

await mkdir(outDir, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shot(page, name) {
  const path = join(outDir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function bodyText(page) {
  return page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' '));
}

async function libraryHasCharacter(page) {
  const re = new RegExp(libraryMatch, 'i');
  const text = await bodyText(page);
  if (re.test(text)) return true;
  const tile = page.getByText(re).first();
  return (await tile.count()) > 0;
}

const steps = [];

async function main() {
const context = await playwright.chromium.launchPersistentContext(profileDir, {
  headless: false,
  acceptDownloads: false,
  channel,
  args: ['--start-maximized'],
  viewport: null,
});
const page = context.pages()[0] ?? (await context.newPage());

try {
  await page.bringToFront().catch(() => {});
  await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(4000);
  steps.push({ step: 'loaded', screenshot: await shot(page, 'char-ref-loaded') });

  if (await libraryHasCharacter(page)) {
    const report = {
      mode: 'CHARACTER_REF_ALREADY_IN_LIBRARY',
      characterName,
      libraryMatch,
      message:
        'Character reference already present in Flow library. Do not re-upload. Use Ingredients → select existing asset → Add to prompt for video.',
      screenshot: await shot(page, 'char-ref-already-present'),
    };
    const reportPath = join(outDir, `char-ref-ready-${Date.now()}.json`);
    await writeFile(reportPath, JSON.stringify({ ...report, steps }, null, 2), 'utf8');
    console.log(JSON.stringify({ ok: true, alreadyPresent: true, reportPath }, null, 2));
    return;
  }

  const promptBox = page.locator('[role="textbox"][aria-label="What do you want to create?"]');
  await promptBox.click({ timeout: 15_000 });
  await sleep(500);

  // Image mode (free) — not Video.
  const trigger = page.locator('button[aria-label="Settings trigger"]');
  await trigger.first().click({ timeout: 10_000 });
  await sleep(1000);
  const imageRadio = page.locator('[role="radio"]').filter({ hasText: /^image\s*Image$|^Image$/i });
  // Prefer explicit Image radio
  const imageBtn = page.locator('[role="radio"]').filter({ hasText: /Image/i });
  if (await imageBtn.count()) {
    await imageBtn.first().click({ timeout: 5_000 });
    await sleep(800);
  }
  // Portrait-ish aspect for character sheet
  const portrait = page.locator('[role="radio"]').filter({ hasText: /3\s*:\s*4|crop_portrait|9\s*:\s*16/i });
  if (await portrait.count()) {
    await portrait.first().click({ timeout: 3_000 }).catch(() => {});
  }
  const x1 = page.locator('[role="radio"]').filter({ hasText: /^x1$/i });
  if (await x1.count()) {
    await x1.first().click({ timeout: 3_000 }).catch(() => {});
  }
  await page.keyboard.press('Escape');
  await sleep(500);
  steps.push({ step: 'image-mode', screenshot: await shot(page, 'char-ref-image-mode') });

  await promptBox.click({ timeout: 10_000 });
  await promptBox.fill(imagePrompt);
  await sleep(800);

  const costText = await bodyText(page);
  const looksFree = /Generating will use 0 credits|0 credits/i.test(costText);
  steps.push({ step: 'pre-image-generate', looksFree, bodySnippet: costText.slice(0, 600) });

  // Image generate — still a Generate click, but expected 0 credits for Image mode.
  const generate = page.locator('button[aria-label="Start generation"]');
  await generate.first().click({ timeout: 10_000 });
  console.info(JSON.stringify({ message: 'Image Generate clicked (expect 0 credits)', looksFree }));
  steps.push({ step: 'image-generate-clicked', screenshot: await shot(page, 'char-ref-generate') });

  const unusual = /unusual activity|browser extensions that modify/i;
  const deadline = Date.now() + 6 * 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    await sleep(4_000);
    const text = await bodyText(page);
    if (unusual.test(text)) {
      throw new Error(
        'HUMAN_INTERVENTION_REQUIRED: Google flagged unusual activity during free Image generate. Finish the character image manually in normal Chrome, then reuse it from the library for video.',
      );
    }
    if (await libraryHasCharacter(page)) {
      ready = true;
      break;
    }
    // Also treat new img tiles / 100% as progress
    if (/\b100\s*%\b/.test(text) || /CHARACTER REFERENCE|night courier/i.test(text)) {
      ready = true;
      break;
    }
    steps.push({ step: 'waiting-image', screenshot: await shot(page, 'char-ref-waiting') });
  }

  if (!ready) {
    throw new Error('Timed out waiting for Flow Image character reference to appear in library');
  }

  const reportPath = join(outDir, `char-ref-created-${Date.now()}.json`);
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        mode: 'CHARACTER_REF_CREATED_IN_FLOW',
        characterName,
        looksFree,
        message:
          'Character reference should now be in Flow library. For video canary: Ingredients → select this asset (do not Upload media again) → Add to prompt → Video settings → Generate.',
        steps,
        screenshot: await shot(page, 'char-ref-done'),
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(JSON.stringify({ ok: true, alreadyPresent: false, reportPath }, null, 2));
} catch (err) {
  const errPath = join(outDir, `char-ref-error-${Date.now()}.json`);
  try {
    await shot(page, 'char-ref-error');
  } catch {
    // ignore
  }
  await writeFile(errPath, JSON.stringify({ error: String(err), steps }, null, 2), 'utf8');
  console.error(JSON.stringify({ error: String(err), errPath }, null, 2));
  process.exitCode = 1;
} finally {
  await context.close();
}
}

await main();
