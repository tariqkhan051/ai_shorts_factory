import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createPlaywrightBrowserSession } from '@ai-shorts-factory/flow-adapter/live';
import { createLogger } from '@ai-shorts-factory/shared-types';

const log = createLogger('flow-worker-auth-session');

/**
 * Headed persistent-profile launcher for manual Google Flow sign-in.
 * - Does not click Generate
 * - Does not spend credits
 * - Does not log cookies, tokens, or passwords
 * - Does not bypass CAPTCHA
 * - Requires an operator-confirmed FLOW_BASE_URL
 */
async function main(): Promise<void> {
  if (process.env.FLOW_EXECUTE_LIVE === 'true') {
    throw new Error(
      'Refusing auth session while FLOW_EXECUTE_LIVE=true. Authentication must stay non-generative.',
    );
  }

  const profileDir =
    process.env.FLOW_BROWSER_PROFILE_DIR?.trim() || join(process.cwd(), '.flow-profile');
  const baseUrl = (process.env.FLOW_BASE_URL || process.argv[2] || '').trim();
  const diagnosticDir =
    process.env.FLOW_DIAGNOSTIC_SCREENSHOT_DIR?.trim() || './diagnostic-screenshots';

  if (!baseUrl) {
    throw new Error(
      'FLOW_BASE_URL is required (or pass the confirmed Google Flow URL as argv[2]). Do not invent a URL.',
    );
  }
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error('Flow URL must be https:// … after you confirm the real workspace URL.');
  }

  await mkdir(profileDir, { recursive: true });
  await mkdir(diagnosticDir, { recursive: true });

  log.info('Launching headed Chromium with persistent profile (no cookies logged)', {
    profileDir,
    headless: false,
    hasUrl: true,
  });

  const session = await createPlaywrightBrowserSession({
    profileDir,
    headless: false,
    baseUrl,
    diagnosticDir,
  });

  await session.goto(baseUrl);

  console.info(
    JSON.stringify(
      {
        message: 'Browser opened for manual authentication',
        instructions: [
          'Sign in to Google manually in the opened window if prompted.',
          'Complete any CAPTCHA or identity checks yourself — automation will not bypass them.',
          'Navigate until your Google Flow workspace is clearly visible.',
          'Do NOT click Generate / create a video.',
          'When the workspace is visible, return here and type: WORKSPACE_VISIBLE',
          'Or type ABORT to close without confirming.',
        ],
        profileDir,
        flowExecuteLive: false,
      },
      null,
      2,
    ),
  );

  const rl = createInterface({ input, output });
  let status: 'AUTHENTICATION_REQUIRED' | 'READY' | 'ABORTED' | 'HUMAN_INTERVENTION_REQUIRED' =
    'AUTHENTICATION_REQUIRED';

  try {
    while (true) {
      const answer = (await rl.question('Confirm status> ')).trim().toUpperCase();
      if (answer === 'WORKSPACE_VISIBLE') {
        status = 'READY';
        console.info(
          JSON.stringify({
            sessionStatus: status,
            message:
              'Operator confirmed workspace visible. Profile preserved locally. No generation performed.',
            urlConfigured: true,
            note: 'Page contents/cookies/tokens were not logged.',
          }),
        );
        break;
      }
      if (answer === 'ABORT') {
        status = 'ABORTED';
        console.info(
          JSON.stringify({ sessionStatus: status, message: 'Closed without confirmation' }),
        );
        break;
      }
      if (answer === 'CAPTCHA' || answer === 'HELP') {
        status = 'HUMAN_INTERVENTION_REQUIRED';
        console.info(
          JSON.stringify({
            sessionStatus: status,
            message: 'Complete the security challenge in the browser, then type WORKSPACE_VISIBLE.',
          }),
        );
        continue;
      }
      console.info('Type WORKSPACE_VISIBLE, CAPTCHA, or ABORT');
    }
  } finally {
    rl.close();
    await session.close();
    log.info('Browser closed; persistent profile retained on disk (contents not logged)', {
      profileDir,
      sessionStatus: status,
    });
  }

  if (status !== 'READY') {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      service: 'flow-worker-auth-session',
      level: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }),
  );
  process.exitCode = 1;
});
