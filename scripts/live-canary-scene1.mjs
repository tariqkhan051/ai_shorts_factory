#!/usr/bin/env node
/**
 * Operator-approved Scene 1 live canary.
 * Requires FLOW_EXECUTE_LIVE=true and FLOW_SPEND_CONFIRM_PHRASE=SPEND_REAL_CREDITS.
 *
 * Character consistency:
 *  - Prefer a reference already in the Flow library (created via free Image mode:
 *    scripts/prepare-flow-character-reference.mjs).
 *  - Never re-upload the same image unless FLOW_FORCE_REUPLOAD=true.
 *  - Attach via Ingredients → select library asset → Add to prompt.
 */
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'packages/flow-adapter/package.json'));
const playwright = require('playwright');

const executeLive = process.env.FLOW_EXECUTE_LIVE === 'true';
const phrase = process.env.FLOW_SPEND_CONFIRM_PHRASE?.trim() || '';
const profileDir =
  process.env.FLOW_BROWSER_PROFILE_DIR?.trim() || join(root, '.flow-profile');
const projectUrl =
  process.env.FLOW_PROJECT_URL?.trim() ||
  'https://flow.google.com/project/cd052117-55ba-426e-a396-9eb70d48dbfa';
const channel = process.env.FLOW_BROWSER_CHANNEL?.trim() || 'chrome';
const outDir = process.env.FLOW_CANARY_OUT_DIR?.trim() || join(root, 'diagnostic-screenshots', 'canary');
const recipePath = join(root, 'packages/flow-adapter/recipes/google-flow.unverified.json');
const referencePath = process.env.FLOW_CANARY_REFERENCE_IMAGE?.trim() || '';
const libraryMatch =
  process.env.FLOW_CHARACTER_LIBRARY_MATCH?.trim() ||
  'rina-courier-reference|CHARACTER REFERENCE|Rina|night courier';
const prompt =
  process.env.FLOW_CANARY_PROMPT?.trim() ||
  'Cinematic vertical shot, rainy neon street, courier girl Rina holding a glowing package that whispers, dramatic rim light, keep character identical to the attached reference image, 8 seconds';

if (!executeLive) {
  console.error(JSON.stringify({ error: 'Refusing: set FLOW_EXECUTE_LIVE=true' }));
  process.exit(1);
}
if (phrase !== 'SPEND_REAL_CREDITS') {
  console.error(JSON.stringify({ error: 'Refusing: FLOW_SPEND_CONFIRM_PHRASE must be SPEND_REAL_CREDITS' }));
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
await mkdir(join(outDir, 'downloads'), { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shot(page, name) {
  const path = join(outDir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

const token = `asf_live_${randomBytes(16).toString('hex')}`;
const steps = [];
let context;
let page;

try {
  context = await playwright.chromium.launchPersistentContext(profileDir, {
    headless: false,
    acceptDownloads: true,
    channel,
    args: ['--start-maximized'],
    viewport: null,
  });
  page = context.pages()[0] ?? (await context.newPage());
  try {
    await page.bringToFront();
  } catch {
    // ignore
  }

  await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(4000);
  try {
    await page.bringToFront();
  } catch {
    // ignore
  }
  console.info(JSON.stringify({ message: 'Browser open on Flow project — watch for ASF Canary Inspect window' }));
  steps.push({ step: 'loaded', screenshot: await shot(page, 'live-canary-loaded') });

  // Ensure composer prompt.
  const promptBox = page.locator('[role="textbox"][aria-label="What do you want to create?"]');
  await promptBox.click({ timeout: 15_000 });
  await sleep(500);

  // Open settings trigger → Video mode → 9:16 → x1 → Veo 3.1 - Lite
  const trigger = page.locator('button[aria-label="Settings trigger"]');
  await trigger.first().click({ timeout: 10_000 });
  await sleep(1000);

  const videoRadio = page.locator('[role="radio"]').filter({ hasText: /Video/i });
  if (await videoRadio.count()) {
    await videoRadio.first().click({ timeout: 5_000 });
    await sleep(800);
  }

  // Aspect 9:16
  const aspect916 = page.locator('[role="radio"]').filter({ hasText: /9\s*:\s*16|crop_9_16/i });
  if (await aspect916.count()) {
    await aspect916.last().click({ timeout: 5_000 });
    await sleep(400);
  }

  // Output count x1 (canary cost control)
  const x1 = page.locator('[role="radio"]').filter({ hasText: /^x1$/i });
  if (await x1.count()) {
    await x1.first().click({ timeout: 5_000 });
    await sleep(400);
  }

  // Model Veo 3.1 - Lite
  const modelBtn = page.locator('[aria-label="Select model family"]');
  if (await modelBtn.count()) {
    await modelBtn.first().click({ timeout: 5_000 });
    await sleep(700);
    await page.getByText('Veo 3.1 - Lite', { exact: true }).first().click({ timeout: 5_000 });
    await sleep(500);
  }

  steps.push({ step: 'video-options-set', screenshot: await shot(page, 'live-canary-options') });
  await page.keyboard.press('Escape');
  await sleep(500);

  // Attach character reference via Ingredients — library only (Flow-generated image preferred).
  const forceReupload = process.env.FLOW_FORCE_REUPLOAD === 'true';
  const addIngredients = page.locator('button[aria-label="Add ingredients to the prompt box"]');
  await addIngredients.first().click({ timeout: 10_000 });
  await sleep(1200);
  steps.push({ step: 'ingredients-menu', screenshot: await shot(page, 'live-canary-ingredients-menu') });

  let attached = false;
  let attachMode = 'none';
  const addToPromptBtn = page.getByRole('button', { name: /Add to prompt/i });

  // Prefer existing library asset — never re-upload by default.
  // If picker already shows Rina + Add to prompt, do NOT click list rows (that can close the modal).
  if (!forceReupload) {
    const addVisible = await addToPromptBtn.first().isVisible().catch(() => false);
    const pickerText = await page.evaluate(() => (document.body?.innerText || '').slice(0, 4000));
    if (addVisible && /rina-courier-reference|Rina|night courier/i.test(pickerText)) {
      attached = true;
      attachMode = 'reuse-library-already-selected';
      console.info(JSON.stringify({ message: 'Ingredients picker already has Rina selected — not re-uploading' }));
      steps.push({ step: 'reuse-library-already-selected', screenshot: await shot(page, 'live-canary-reuse-library') });
    } else {
      const uploadsTab = page.getByText(/^Uploads$/i).first();
      if (await uploadsTab.count()) {
        await uploadsTab.click({ timeout: 3_000 }).catch(() => {});
        await sleep(600);
      }
      const titles = page.locator('span.footer-title').filter({ hasText: /rina-courier-reference/i });
      const n = await titles.count();
      for (let i = 0; i < n; i++) {
        const el = titles.nth(i);
        if (!(await el.isVisible().catch(() => false))) continue;
        await el.click({ timeout: 5_000 });
        await sleep(800);
        if (await addToPromptBtn.first().isVisible().catch(() => false)) {
          attached = true;
          attachMode = 'reuse-library';
          console.info(JSON.stringify({ message: 'Selected library Rina via footer-title', index: i }));
          steps.push({ step: 'reuse-library-asset', screenshot: await shot(page, 'live-canary-reuse-library') });
          break;
        }
      }
    }
  }

  if (!attached && forceReupload && referencePath && existsSync(referencePath)) {
    const uploadMedia = page.getByRole('button', { name: /Upload media/i }).or(
      page.locator('button').filter({ hasText: /Upload media/i }),
    );
    try {
      const chooserPromise = page.waitForEvent('filechooser', { timeout: 15_000 });
      await uploadMedia.first().click({ timeout: 8_000 });
      const chooser = await chooserPromise;
      await chooser.setFiles(referencePath);
      attached = true;
      attachMode = 'uploaded-forced';
      console.info(JSON.stringify({ message: 'FLOW_FORCE_REUPLOAD=true — uploaded local file once' }));
    } catch (e) {
      steps.push({ step: 'upload-media-chooser-failed', error: String(e).slice(0, 240) });
    }
    if (attached) {
      const assetTile = page.getByText(libraryRe).first();
      if (await assetTile.count()) {
        await assetTile.click({ timeout: 5_000 }).catch(() => {});
      }
    }
  }

  if (!attached) {
    throw new Error(
      'No character reference in Flow library. First run (free Image mode): node scripts/prepare-flow-character-reference.mjs — then re-run this canary. Do not Upload media repeatedly.',
    );
  }

  // Add selected asset to prompt, then dismiss overlay.
  if (attached) {
    const addToPrompt = page.getByRole('button', { name: /Add to prompt/i });
    await addToPrompt.first().waitFor({ state: 'visible', timeout: 60_000 });
    for (let i = 0; i < 30; i++) {
      const disabled = await addToPrompt.first().isDisabled().catch(() => false);
      if (!disabled) break;
      await sleep(1000);
    }
    await sleep(800);
    await addToPrompt.first().click({ timeout: 15_000 });
    await sleep(1200);
    steps.push({ step: 'added-to-prompt', attachMode, screenshot: await shot(page, 'live-canary-added-to-prompt') });

    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Escape');
      await sleep(300);
    }
    const backdrop = page.locator('.cdk-overlay-backdrop-showing');
    if (await backdrop.count()) {
      await backdrop.first().click({ force: true }).catch(() => {});
      await sleep(400);
    }
  }

  await sleep(800);
  steps.push({
    step: 'reference-attach-attempt',
    attached,
    attachMode,
    forceReupload,
    referencePath,
    screenshot: await shot(page, 'live-canary-reference'),
  });

  if (!attached) {
    throw new Error('Failed to attach character reference image via Ingredients — aborting before Generate');
  }

  // Fill prompt slowly (after attachment). Watch for Google "unusual activity" block.
  await promptBox.click({ timeout: 15_000, force: true });
  await promptBox.fill('');
  await sleep(300);
  await promptBox.pressSequentially(prompt, { delay: 15 });
  await sleep(1000);

  async function detectUnusualActivity() {
    const text = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' '));
    return /unusual activity|browser extensions that modify the page|Failed\s+We noticed/i.test(text);
  }

  if (await detectUnusualActivity()) {
    steps.push({
      step: 'HUMAN_INTERVENTION_REQUIRED',
      reason: 'Google Flow flagged unusual activity after prompt fill',
      screenshot: await shot(page, 'live-canary-unusual-activity'),
    });
    throw new Error(
      'HUMAN_INTERVENTION_REQUIRED: Google Flow blocked automation ("unusual activity"). Do not re-upload the same image. Open Flow in normal Chrome with this profile, reuse the existing Rina library asset, and click Generate manually.',
    );
  }

  steps.push({ step: 'prompt-ready', screenshot: await shot(page, 'live-canary-prompt-ready') });

  const bodyBefore = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 4000));
  steps.push({ step: 'pre-generate-body', bodySnippet: bodyBefore.slice(0, 800) });

  async function pageProgress() {
    return page.evaluate(() => {
      const visible = (el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0;
      };
      const text = (document.body?.innerText || '').replace(/\s+/g, ' ');
      const videos = [...document.querySelectorAll('video')].filter(visible);
      const pct = text.match(/\b(\d{1,3})\s*%/g) || [];
      const generating =
        /generat(ing|ion)|creating|working|processing|queued|in progress|rendering/i.test(text) ||
        pct.length > 0;
      const buttons = [...document.querySelectorAll('button, a, [role="button"]')]
        .filter(visible)
        .map((el) => ({
          text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80),
          ariaLabel: el.getAttribute('aria-label'),
        }))
        .filter((b) => /download|save|export|more_vert|share/i.test(`${b.text} ${b.ariaLabel || ''}`));
      return {
        videoCount: videos.length,
        generating,
        pct,
        bodySnippet: text.slice(0, 500),
        buttons,
      };
    });
  }

  // Prefer manual Generate click (avoids Google "unusual activity" on Playwright submit).
  const manualGenerate = process.env.FLOW_MANUAL_GENERATE !== 'false';
  let started = false;

  if (manualGenerate) {
    process.env.FLOW_KEEP_BROWSER_OPEN = 'true';
    console.log(
      JSON.stringify({
        manualGenerate: true,
        message:
          'READY: In the Flow Chrome window, click the white Start generation arrow. Do not re-upload Rina. Waiting for progress…',
      }),
    );
    steps.push({
      step: 'manual-generate-handoff',
      screenshot: await shot(page, 'live-canary-manual-handoff'),
    });
    const handoffDeadline = Date.now() + 10 * 60_000;
    while (Date.now() < handoffDeadline && !started) {
      await sleep(3_000);
      if (await detectUnusualActivity()) {
        throw new Error(
          'HUMAN_INTERVENTION_REQUIRED: unusual-activity dialog present. Do NOT retry Generate in this Playwright Chrome — Google flags the automated session even for human clicks. Close this window, open Flow in plain Chrome (scripts/open-flow-auth-chrome.ps1), reuse library Rina, then Generate there.',
        );
      }
      const prog = await pageProgress();
      if (prog.generating || prog.videoCount > 0 || prog.pct.length > 0) {
        started = true;
        console.info(JSON.stringify({ message: 'Manual generation progress detected', prog }));
        steps.push({
          step: 'generation-progress-detected',
          prog,
          screenshot: await shot(page, 'live-canary-progress'),
        });
      }
    }
    if (!started) {
      throw new Error('Timed out waiting for you to click Generate (no progress within 10 minutes).');
    }
  } else {
    const generate = page.locator('button[aria-label="Start generation"]');
    await generate.first().click({ timeout: 10_000 });
    console.info(JSON.stringify({ message: 'Generate clicked — expecting progress UI' }));
    steps.push({
      step: 'generate-clicked',
      token,
      phrase: 'SPEND_REAL_CREDITS',
      at: new Date().toISOString(),
      screenshot: await shot(page, 'live-canary-generate-clicked'),
    });
    await sleep(2000);
    if (await detectUnusualActivity()) {
      process.env.FLOW_KEEP_BROWSER_OPEN = 'true';
      throw new Error(
        'HUMAN_INTERVENTION_REQUIRED: Google Flow flagged unusual activity after Generate. Click Generate manually; do not re-upload Rina.',
      );
    }
    for (let attempt = 0; attempt < 2 && !started; attempt++) {
      const startDeadline = Date.now() + 45_000;
      while (Date.now() < startDeadline) {
        await sleep(2_000);
        if (await detectUnusualActivity()) {
          process.env.FLOW_KEEP_BROWSER_OPEN = 'true';
          throw new Error(
            'HUMAN_INTERVENTION_REQUIRED: unusual-activity dialog while waiting for generation.',
          );
        }
        const prog = await pageProgress();
        if (prog.generating || prog.videoCount > 0 || prog.pct.length > 0) {
          started = true;
          console.info(JSON.stringify({ message: 'Generation progress detected', prog }));
          steps.push({
            step: 'generation-progress-detected',
            prog,
            screenshot: await shot(page, 'live-canary-progress'),
          });
          break;
        }
      }
      if (!started && attempt === 0) {
        await generate.first().click({ timeout: 10_000, force: true }).catch(() => {});
      }
    }
    if (!started) {
      throw new Error(
        'Generate click did not start a visible generation within 90s. Aborting without assuming credits spent.',
      );
    }
  }

  // Wait for result video (up to 12 min)
  const deadline = Date.now() + 12 * 60_000;
  let ready = false;
  let downloadSelector = '';
  let resultSelector = '';

  while (Date.now() < deadline) {
    await sleep(5_000);
    const snap = await pageProgress();
    console.info(
      JSON.stringify({
        message: 'polling',
        videoCount: snap.videoCount,
        generating: snap.generating,
        pct: snap.pct,
      }),
    );
    if (snap.videoCount > 0) {
      ready = true;
      resultSelector = 'video';
      const dl = snap.buttons.find((b) => /download/i.test(`${b.text} ${b.ariaLabel || ''}`));
      if (dl?.ariaLabel) downloadSelector = `button[aria-label="${dl.ariaLabel}"]`;
      else if (dl?.text) downloadSelector = `button:has-text("${dl.text.slice(0, 40)}")`;
      steps.push({ step: 'result-observed', snap, screenshot: await shot(page, 'live-canary-result') });
      break;
    }
    steps.push({ step: 'waiting', snap, screenshot: await shot(page, 'live-canary-waiting') });
  }

  if (!ready) {
    throw new Error('Timed out waiting for generated video in Flow UI');
  }

  const dest = join(outDir, 'downloads', `scene1-${Date.now()}.mp4`);
  let downloaded = false;
  if (downloadSelector) {
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 120_000 }),
        page.locator(downloadSelector).first().click({ timeout: 10_000 }),
      ]);
      await download.saveAs(dest);
      downloaded = true;
    } catch (e) {
      steps.push({ step: 'download-selector-failed', error: String(e).slice(0, 300) });
    }
  }

  if (!downloaded) {
    try {
      const more = page.locator('button[aria-label*="More" i], button:has-text("more_vert")').last();
      await more.click({ timeout: 5_000 });
      await sleep(800);
      const dlItem = page.getByText(/Download|Save|Export/i).first();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 120_000 }),
        dlItem.click({ timeout: 10_000 }),
      ]);
      await download.saveAs(dest);
      downloaded = true;
      downloadSelector = 'button[aria-label*="More" i] >> nth=-1 ; then text=Download';
      steps.push({ step: 'download-via-more-menu', screenshot: await shot(page, 'live-canary-downloaded') });
    } catch (e) {
      steps.push({ step: 'download-fallback-failed', error: String(e).slice(0, 300) });
    }
  }

  let assetMeta = null;
  if (downloaded && existsSync(dest)) {
    const bytes = await readFile(dest);
    assetMeta = {
      path: dest,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    await copyFile(dest, join(outDir, 'scene1-canary-latest.mp4'));
  }

  const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
  recipe.baseUrl = projectUrl;
  recipe.modelOptionLabel = 'Veo 3.1 - Lite';
  recipe.aspectRatioOptionLabel = '9:16';
  recipe.verifiedAt = new Date().toISOString();
  recipe.verifiedBy = 'operator-approved-live-canary';
  recipe.selectors.promptInput = '[role="textbox"][aria-label="What do you want to create?"]';
  recipe.selectors.modelControl = '[aria-label="Select model family"]';
  recipe.selectors.durationControl = 'button[aria-label="Settings trigger"]';
  recipe.selectors.resolutionControl = 'button[aria-label="Settings trigger"]';
  recipe.selectors.aspectRatioControl = 'button[aria-label="Settings trigger"]';
  recipe.selectors.submitButton = 'button[aria-label="Start generation"]';
  recipe.selectors.resultReady = resultSelector || 'video';
  recipe.selectors.downloadButton = downloadSelector || 'button[aria-label*="Download" i]';
  recipe.selectors.creditCostBadge = 'text=Generating will use';
  recipe.selectors.workspaceReady = 'button[aria-label="Start generation"]';
  recipe.notes =
    'Verified via operator-approved Scene 1 live canary. Character ref from Flow library (Ingredients reuse). Veo 3.1 - Lite, 9:16, 8s/720p pill, x1.';
  await writeFile(recipePath, JSON.stringify(recipe, null, 2) + '\n', 'utf8');
  const verifiedPath = join(root, 'packages/flow-adapter/recipes/google-flow.verified.json');
  await writeFile(verifiedPath, JSON.stringify(recipe, null, 2) + '\n', 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    mode: manualGenerate ? 'MANUAL_GENERATE_THEN_DOWNLOAD' : 'EXECUTE_LIVE_CANARY_SCENE1',
    token,
    phrase: 'SPEND_REAL_CREDITS',
    projectUrl,
    prompt,
    attachMode,
    attached,
    downloaded,
    assetMeta,
    resultSelector,
    downloadSelector,
    recipePath,
    verifiedPath,
    steps,
  };
  const reportPath = join(outDir, `live-canary-result-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(
    JSON.stringify(
      { ok: downloaded, reportPath, assetMeta, attached, recipeVerifiedAt: recipe.verifiedAt },
      null,
      2,
    ),
  );
  if (!downloaded) process.exitCode = 1;
} catch (err) {
  const errPath = join(outDir, `live-canary-error-${Date.now()}.json`);
  try {
    if (page) await shot(page, 'live-canary-error');
  } catch {
    // ignore
  }
  await writeFile(
    errPath,
    JSON.stringify({ error: String(err), steps, at: new Date().toISOString() }, null, 2),
  );
  console.error(JSON.stringify({ error: String(err), errPath }, null, 2));
  process.exitCode = 1;
} finally {
  if (context && process.env.FLOW_KEEP_BROWSER_OPEN !== 'true') {
    await context.close();
  } else if (context) {
    console.info(
      JSON.stringify({
        message: 'Leaving Chrome open for manual intervention — close it yourself when done',
      }),
    );
  }
}
