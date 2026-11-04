#!/usr/bin/env node
/**
 * Inspect Google Flow workspace for recipe selectors + option inventory.
 * NEVER clicks Generate / Create. NEVER spends credits. NEVER logs cookies/tokens.
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

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await new Promise((resolve) => setTimeout(resolve, 5_000));

  const title = await page.title();
  const host = new URL(page.url()).host;
  const screenshotPath = join(outDir, `flow-workspace-inspect-${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const inventory = await page.evaluate(() => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const cssPath = (el) => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && parts.length < 5) {
        let part = node.tagName.toLowerCase();
        if (node.getAttribute('role')) part += `[role="${node.getAttribute('role')}"]`;
        if (node.getAttribute('aria-label')) {
          part += `[aria-label="${node.getAttribute('aria-label').slice(0, 80)}"]`;
        } else if (node.getAttribute('data-testid')) {
          part += `[data-testid="${node.getAttribute('data-testid')}"]`;
        } else if (node.classList?.length) {
          const cls = [...node.classList].slice(0, 2).join('.');
          if (cls) part += `.${cls}`;
        }
        const parent = node.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter((c) => c.tagName === node.tagName);
          if (siblings.length > 1) {
            part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
          }
        }
        parts.unshift(part);
        node = parent;
        if (node?.id) {
          parts.unshift(`#${CSS.escape(node.id)}`);
          break;
        }
      }
      return parts.join(' > ');
    };

    const interesting = [];
    const selector =
      'button, [role="button"], textarea, input, [contenteditable="true"], select, [role="textbox"], [role="combobox"], [role="listbox"], [role="option"], [role="menuitem"]';
    for (const el of document.querySelectorAll(selector)) {
      if (!visible(el)) continue;
      const text = (el.innerText || el.value || el.getAttribute('aria-label') || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 120);
      interesting.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        type: el.getAttribute('type'),
        ariaLabel: el.getAttribute('aria-label'),
        name: el.getAttribute('name'),
        testId: el.getAttribute('data-testid'),
        placeholder: el.getAttribute('placeholder'),
        text,
        cssPath: cssPath(el),
      });
    }

    const bodyText = (document.body?.innerText || '').slice(0, 4000);
    const loginHints = /sign in|log in|choose an account/i.test(bodyText);
    const captchaHints = /captcha|verify you.re human|unusual traffic/i.test(bodyText);
    const generateHints = interesting.filter((item) =>
      /generate|create|make video|submit|run/i.test(
        `${item.text || ''} ${item.ariaLabel || ''} ${item.placeholder || ''}`,
      ),
    );
    const promptHints = interesting.filter(
      (item) =>
        item.tag === 'textarea' ||
        item.role === 'textbox' ||
        item.contentEditable === 'true' ||
        /prompt|describe|idea|what do you want/i.test(
          `${item.text || ''} ${item.ariaLabel || ''} ${item.placeholder || ''}`,
        ),
    );

    return {
      loginHints,
      captchaHints,
      bodyTextSample: bodyText.slice(0, 1500),
      interesting: interesting.slice(0, 120),
      generateHints: generateHints.slice(0, 20),
      promptHints: promptHints.slice(0, 20),
    };
  });

  // Do not click Generate. Optionally open settings-looking comboboxes labeled model/aspect/duration.
  const optionProbes = [];
  for (const candidate of inventory.interesting) {
    const hay = `${candidate.text || ''} ${candidate.ariaLabel || ''}`.toLowerCase();
    if (
      /model|aspect|ratio|duration|seconds|resolution|720|1080|9:16|vertical|settings|quality/.test(
        hay,
      )
    ) {
      optionProbes.push(candidate);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'WORKSPACE_INSPECT_NO_GENERATE',
    url: page.url(),
    host,
    titleLength: title.length,
    browserChannel: channel,
    profileDir,
    screenshotPath,
    loginHints: inventory.loginHints,
    captchaHints: inventory.captchaHints,
    sessionGuess: inventory.loginHints
      ? 'AUTHENTICATION_REQUIRED'
      : inventory.captchaHints
        ? 'HUMAN_INTERVENTION_REQUIRED'
        : 'READY',
    promptHints: inventory.promptHints,
    generateHints: inventory.generateHints,
    optionProbes,
    interestingCount: inventory.interesting.length,
    interesting: inventory.interesting,
    bodyTextSample: inventory.bodyTextSample,
    flowExecuteLive: false,
    generateClicked: false,
  };

  const reportPath = join(outDir, `flow-workspace-inspect-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(
    JSON.stringify(
      {
        reportPath,
        screenshotPath,
        sessionGuess: report.sessionGuess,
        promptHints: report.promptHints.length,
        generateHints: report.generateHints.length,
        optionProbes: report.optionProbes.length,
        interestingCount: report.interestingCount,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
}
