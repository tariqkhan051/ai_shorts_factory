import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  describeFlowProviderStatus,
  loadFlowUiRecipeFromFile,
  type VideoGenerationProvider,
} from '@ai-shorts-factory/flow-adapter';
import {
  createVideoGenerationProvider,
  GoogleFlowPlaywrightProvider,
} from '@ai-shorts-factory/flow-adapter/live';
import { BUSINESS_DEFAULTS, PHASE } from '@ai-shorts-factory/shared-types';

/**
 * Phase 4 operator tool: attempt exactly one Google Flow UI generation.
 * Refuses unless live gates + verified recipe are satisfied.
 * Never invents Flow HTTP APIs; never bypasses CAPTCHA.
 */
async function main(): Promise<void> {
  const status = describeFlowProviderStatus(process.env);
  console.info(
    JSON.stringify({
      service: 'flow-worker-verify-scene',
      phase: PHASE.current,
      status,
    }),
  );

  if (status.provider === 'mock') {
    console.error(
      JSON.stringify({
        level: 'error',
        message:
          'Set FLOW_PROVIDER=playwright plus live gates after verifying UI selectors. Mock cannot verify live Flow.',
      }),
    );
    process.exitCode = 1;
    return;
  }

  let provider: VideoGenerationProvider = createVideoGenerationProvider({
    env: process.env,
  });

  if (process.env.FLOW_UI_RECIPE_PATH?.trim()) {
    const recipe = await loadFlowUiRecipeFromFile(process.env.FLOW_UI_RECIPE_PATH);
    provider = createVideoGenerationProvider({ env: process.env, recipe });
  }

  const config = await provider.validateConfiguration();
  if (!config.ok) {
    console.error(JSON.stringify({ level: 'error', message: config.message }));
    process.exitCode = 1;
    return;
  }

  const availability = await provider.checkAvailability();
  if (!availability.available) {
    console.error(
      JSON.stringify({
        level: 'error',
        reason: availability.reason,
        message: availability.message,
      }),
    );
    process.exitCode = 1;
    return;
  }

  const prompt =
    process.env.FLOW_VERIFY_PROMPT?.trim() ||
    'Phase 4 single-scene verification: cinematic neon rain alley, slow push-in, no text.';

  const submission = await provider.submitGeneration({
    idempotencyKey: `verify-scene:${Date.now()}`,
    prompt,
    model: BUSINESS_DEFAULTS.defaultGenerationModel,
    durationSeconds: BUSINESS_DEFAULTS.defaultGenerationDurationSeconds,
    resolution: BUSINESS_DEFAULTS.defaultGenerationResolution,
  });

  console.info(JSON.stringify({ message: 'Submitted', submissionId: submission.submissionId }));

  const result = await provider.waitForCompletion(submission.submissionId);
  console.info(JSON.stringify({ message: 'Completion', result }));

  if (result.state !== 'completed') {
    process.exitCode = 1;
    if (provider instanceof GoogleFlowPlaywrightProvider) {
      await provider.dispose();
    }
    return;
  }

  const outDir = await mkdtemp(join(tmpdir(), 'asf-verify-'));
  await mkdir(outDir, { recursive: true });
  const dest = join(outDir, 'scene-1.bin');
  const asset = await provider.downloadAsset(submission.submissionId, dest);
  const cost = await provider.getObservedCreditCost(submission.submissionId);
  await writeFile(
    join(outDir, 'verify-result.json'),
    JSON.stringify({ submission, asset, cost, result }, null, 2),
    'utf8',
  );

  console.info(
    JSON.stringify({
      message: 'Single-scene verify succeeded',
      asset,
      cost,
      outDir,
    }),
  );

  if (provider instanceof GoogleFlowPlaywrightProvider) {
    await provider.dispose();
  }
}

main().catch(async (error: unknown) => {
  console.error(
    JSON.stringify({
      service: 'flow-worker-verify-scene',
      level: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }),
  );
  process.exitCode = 1;
});
