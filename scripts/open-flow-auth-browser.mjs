#!/usr/bin/env node
/**
 * Headed persistent-profile open for manual Google Flow sign-in.
 * Does not click Generate, does not spend credits, does not log cookies/tokens.
 * Stays open until SIGTERM / process kill, or until OPERATOR_CONFIRMED marker appears.
 */
import { createRequire } from 'node:module';
import { mkdir, writeFile, access, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'packages/flow-adapter/package.json'));
const profileDir =
  process.env.FLOW_BROWSER_PROFILE_DIR?.trim() || join(root, '.flow-profile');
const baseUrl = (process.env.FLOW_BASE_URL || 'https://flow.google.com/').trim();
const diagnosticDir =
  process.env.FLOW_DIAGNOSTIC_SCREENSHOT_DIR?.trim() || join(root, 'diagnostic-screenshots');
const confirmMarker = join(profileDir, 'OPERATOR_CONFIRMED');
const pidFile = join(profileDir, 'auth-session.pid');

if (process.env.FLOW_EXECUTE_LIVE === 'true') {
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'Refusing auth browser while FLOW_EXECUTE_LIVE=true',
    }),
  );
  process.exit(1);
}

await mkdir(profileDir, { recursive: true });
await mkdir(diagnosticDir, { recursive: true });
try {
  await unlink(confirmMarker);
} catch {
  // ok
}

const playwright = require('playwright');

/**
 * Google often blocks sign-in in Playwright's bundled Chromium
 * ("This browser or app may not be secure"). Prefer installed Chrome/Edge.
 * This is not a CAPTCHA bypass — it uses a normal supported browser channel.
 */
const preferredChannel = (process.env.FLOW_BROWSER_CHANNEL || '').trim().toLowerCase();
const channelCandidates = preferredChannel
  ? [preferredChannel]
  : ['chrome', 'msedge', ''];

let context;
let usedChannel = 'chromium';
let lastError = null;
for (const channel of channelCandidates) {
  try {
    const launchOptions = {
      headless: false,
      acceptDownloads: false,
    };
    if (channel) {
      launchOptions.channel = channel;
    }
    context = await playwright.chromium.launchPersistentContext(profileDir, launchOptions);
    usedChannel = channel || 'chromium';
    lastError = null;
    break;
  } catch (error) {
    lastError = error;
  }
}
if (!context) {
  console.error(
    JSON.stringify({
      level: 'error',
      message:
        'Could not launch Chrome/Edge/Chromium for auth. Install Google Chrome or Microsoft Edge, then retry.',
      detail: lastError instanceof Error ? lastError.message : String(lastError),
    }),
  );
  process.exit(1);
}

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await writeFile(pidFile, String(process.pid), 'utf8');

console.log(
  JSON.stringify({
    message: 'Headed Flow auth browser opened',
    url: baseUrl,
    profileDir,
    browserChannel: usedChannel,
    instructions: [
      'Sign in manually if prompted (use the normal Google sign-in UI).',
      'Complete CAPTCHA yourself if shown — automation will not bypass it.',
      'Do NOT click Generate.',
      'When the Flow workspace is visible, reply in chat: workspace visible',
    ],
    flowExecuteLive: false,
  }),
);

const poll = setInterval(async () => {
  try {
    await access(confirmMarker);
    clearInterval(poll);
    console.log(
      JSON.stringify({
        sessionStatus: 'READY',
        message: 'Operator confirmation marker detected. Closing browser; profile preserved.',
      }),
    );
    await context.close();
    try {
      await unlink(pidFile);
    } catch {
      // ok
    }
    try {
      await unlink(confirmMarker);
    } catch {
      // ok
    }
    process.exit(0);
  } catch {
    // wait
  }
}, 1500);

process.on('SIGINT', async () => {
  clearInterval(poll);
  await context.close();
  process.exit(1);
});
process.on('SIGTERM', async () => {
  clearInterval(poll);
  await context.close();
  process.exit(1);
});

// Keep event loop alive
await new Promise(() => {});