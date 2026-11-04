import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MemoryCreditLedger } from '@ai-shorts-factory/credit-manager';
import {
  assertLiveSpendConfirmation,
  createLiveSpendConfirmation,
  describeFlowProviderStatus,
  evaluateFlowExecuteGates,
  isRecipeVerified,
  LIVE_SPEND_CONFIRM_PHRASE,
  loadFlowUiRecipeFromEnv,
  readFlowLiveConfig,
  resolveLiveMaxScenes,
  type LiveSpendConfirmationPayload,
} from '@ai-shorts-factory/flow-adapter';
import {
  createVideoGenerationProvider,
  GoogleFlowPlaywrightProvider,
} from '@ai-shorts-factory/flow-adapter/live';
import { BUSINESS_DEFAULTS, PHASE, createLogger } from '@ai-shorts-factory/shared-types';
import { MemoryObjectStorage } from '@ai-shorts-factory/storage';
import { SCREENPLAY_SCHEMA_VERSION, type ScreenplayV1 } from '@ai-shorts-factory/validation';
import {
  MemoryGenerationStore,
  SequentialGenerationRunner,
} from '@ai-shorts-factory/workflow-engine';

const log = createLogger('flow-worker-canary');

/**
 * One-scene live canary. Defaults to preflight-only (no Flow submit, no credit spend).
 * Set FLOW_EXECUTE_LIVE=true only after reviewing the preflight report.
 */
async function main(): Promise<void> {
  const env = process.env;
  const flow = describeFlowProviderStatus(env);
  const config = readFlowLiveConfig(env);
  const executeLive = env.FLOW_EXECUTE_LIVE === 'true';
  const projectId = env.FLOW_CANARY_PROJECT_ID?.trim() || 'canary-project';
  const userId = env.FLOW_CANARY_USER_ID?.trim() || 'canary-user';

  const prompt =
    env.FLOW_CANARY_PROMPT?.trim() ||
    env.FLOW_VERIFY_PROMPT?.trim() ||
    'Canary Scene 1: cinematic neon rain alley, slow push-in, vertical 9:16, no on-screen text.';

  const estimated =
    typeof config.estimatedCostPerScene === 'number' ? 'estimated' : 'unknown';

  let confirmation: LiveSpendConfirmationPayload;
  const token = env.FLOW_SPEND_CONFIRMATION_TOKEN?.trim();
  if (token) {
    confirmation = {
      token,
      projectId,
      sceneNumber: 1,
      prompt,
      model: config.model,
      aspectRatio: config.aspectRatio,
      resolution: config.resolution,
      durationSeconds: config.durationSeconds,
      estimatedCreditCost: estimated,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      phrase: LIVE_SPEND_CONFIRM_PHRASE,
    };
  } else {
    confirmation = createLiveSpendConfirmation({
      projectId,
      sceneNumber: 1,
      prompt,
      model: config.model,
      aspectRatio: config.aspectRatio,
      resolution: config.resolution,
      durationSeconds: config.durationSeconds,
      estimatedCreditCost: estimated,
    });
  }

  const preflight = {
    phase: PHASE.current,
    mode: executeLive ? 'EXECUTE_LIVE' : 'PREFLIGHT_ONLY',
    provider: flow.provider,
    session: flow.session,
    gatesOk: flow.gatesOk,
    gateReasons: flow.gateReasons,
    canaryOnly: config.canaryOnly,
    maxLiveScenesPerProject: config.maxLiveScenesPerProject,
    projectId,
    userId,
    sceneNumber: 1,
    prompt,
    model: config.model,
    aspectRatio: config.aspectRatio,
    resolution: config.resolution,
    durationSeconds: config.durationSeconds,
    estimatedCreditCost: estimated,
    maxDailyCreditBudget: config.maxDailyCreditBudget,
    confirmationToken: confirmation.token,
    confirmPhrase: LIVE_SPEND_CONFIRM_PHRASE,
    warnings: [
      ...(flow.gatesOk ? [] : flow.gateReasons),
      config.canaryOnly ? null : 'FLOW_CANARY_ONLY is false — refuse until canary passes',
      config.maxLiveScenesPerProject === 1
        ? null
        : 'Canary requires FLOW_MAX_LIVE_SCENES_PER_PROJECT=1',
    ].filter(Boolean),
    nextStep: executeLive
      ? 'Submitting Scene 1 to Google Flow (real credits)'
      : 'Review this report. To spend real credits, re-run with FLOW_EXECUTE_LIVE=true and FLOW_SPEND_CONFIRM_PHRASE=SPEND_REAL_CREDITS',
  };

  const outDir = env.FLOW_CANARY_OUT_DIR?.trim() || './diagnostic-screenshots/canary';
  await mkdir(outDir, { recursive: true });
  const reportPath = join(outDir, `canary-preflight-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify(preflight, null, 2), 'utf8');

  log.info('Canary preflight ready', { reportPath, executeLive });
  console.info(JSON.stringify({ message: 'Canary preflight', preflight, reportPath }, null, 2));

  if (!executeLive) {
    console.info(
      JSON.stringify({
        message: 'STOP — no live generation executed. Explicit FLOW_EXECUTE_LIVE=true required.',
      }),
    );
    return;
  }

  if (!config.canaryOnly || resolveLiveMaxScenes(config) !== 1) {
    throw new Error('Live execute refused: enable FLOW_CANARY_ONLY=true and max scenes = 1');
  }

  assertLiveSpendConfirmation({
    confirmation,
    projectId,
    sceneNumber: 1,
    typedPhrase: env.FLOW_SPEND_CONFIRM_PHRASE?.trim() || '',
    providedToken: confirmation.token,
  });

  const recipe = loadFlowUiRecipeFromEnv(env);
  const executeGates = evaluateFlowExecuteGates(env, isRecipeVerified(recipe));
  if (!executeGates.ok) {
    throw new Error(`Live execute gates closed: ${executeGates.reasons.join('; ')}`);
  }
  if (!flow.gatesOk) {
    throw new Error(`Live gates closed: ${flow.gateReasons.join('; ')}`);
  }

  const screenplay = await loadCanaryScreenplay(env, prompt);
  const store = new MemoryGenerationStore();
  store.seed({
    projectId,
    userId,
    workflowState: 'SCENE_PREPARATION',
    screenplay,
  });
  const credits = new MemoryCreditLedger({
    dailyBudget: config.maxDailyCreditBudget,
  });
  const storage = new MemoryObjectStorage();
  const provider = createVideoGenerationProvider({ env });
  const runner = new SequentialGenerationRunner(store, credits, provider, storage);

  let verifyDownloadedAsset:
    | ((localPath: string) => Promise<
        | { ok: true; durationSeconds: number; width: number | null; height: number | null; hasVideo: true }
        | { ok: false; reason: string }
      >)
    | undefined;

  try {
    const { resolveMediaToolPaths, probeMedia } = await import('@ai-shorts-factory/media-engine');
    const paths = resolveMediaToolPaths(env);
    verifyDownloadedAsset = async (localPath: string) => {
      try {
        const probe = await probeMedia(paths, localPath);
        if (!probe.hasVideo || probe.durationSeconds <= 0) {
          return { ok: false, reason: 'FFprobe: missing video stream or zero duration' };
        }
        return {
          ok: true,
          durationSeconds: probe.durationSeconds,
          width: probe.width,
          height: probe.height,
          hasVideo: true as const,
        };
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? error.message : 'FFprobe verification failed',
        };
      }
    };
  } catch {
    log.info('media-engine unavailable — download size/sha checks still apply');
  }

  const result = await runner.runProject(userId, projectId, {
    workerId: `canary:${process.pid}`,
    maxScenes: 1,
    model: config.model,
    durationSeconds: config.durationSeconds,
    resolution: config.resolution,
    aspectRatio: config.aspectRatio,
    estimatedCostPerScene:
      typeof config.estimatedCostPerScene === 'number'
        ? config.estimatedCostPerScene
        : BUSINESS_DEFAULTS.estimatedCostPerScene,
    assetOrigin: 'REAL_GENERATED',
    requireSpendConfirmation: true,
    spendConfirmationAccepted: true,
    verifyDownloadedAsset,
  });

  const snapshot = await store.getProjectSnapshot(userId, projectId);
  const balances = await credits.getBalances(userId);
  const resultPath = join(outDir, `canary-result-${Date.now()}.json`);
  await writeFile(
    resultPath,
    JSON.stringify({ result, snapshot, balances, preflight }, null, 2),
    'utf8',
  );

  console.info(JSON.stringify({ message: 'Canary finished', result, resultPath, balances }, null, 2));

  if (provider instanceof GoogleFlowPlaywrightProvider) {
    await provider.dispose();
  }

  if (result.failed || result.completed !== 1) {
    process.exitCode = 1;
  }
}

async function loadCanaryScreenplay(env: NodeJS.ProcessEnv, scene1Prompt: string): Promise<ScreenplayV1> {
  const path = env.FLOW_CANARY_SCREENPLAY_PATH?.trim();
  if (path) {
    const raw = JSON.parse(await readFile(path, 'utf8')) as ScreenplayV1;
    return raw;
  }

  return {
    schema_version: SCREENPLAY_SCHEMA_VERSION,
    title: 'Live Canary',
    category: 'cinematic',
    visual_style: 'realistic_cinematic',
    story_summary: 'One-scene Google Flow canary',
    hook: 'Open',
    characters: [{ name: 'Ava', description: 'Lead', visual_identity: 'Red coat' }],
    scenes: [1, 2, 3, 4, 5].map((n) => ({
      scene_number: n,
      title: `Scene ${n}`,
      duration_seconds: 6,
      visual_description: `Visual ${n}`,
      flow_prompt: n === 1 ? scene1Prompt : `Canary placeholder scene ${n} — must not generate while canary-only`,
      narration: '',
      dialogue: '',
      text_overlay: '',
      transition_out: 'cut',
    })),
    ending: 'Done',
    publishing_metadata: { title: 'Live Canary', description: 'Canary', tags: ['canary'] },
  };
}

main().catch(async (error: unknown) => {
  console.error(
    JSON.stringify({
      service: 'flow-worker-canary',
      level: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }),
  );
  process.exitCode = 1;
});
