import { MemoryCreditLedger } from '@ai-shorts-factory/credit-manager';
import { describeFlowProviderStatus } from '@ai-shorts-factory/flow-adapter';
import {
  createVideoGenerationProvider,
  GoogleFlowPlaywrightProvider,
} from '@ai-shorts-factory/flow-adapter/live';
import { BUSINESS_DEFAULTS, PHASE } from '@ai-shorts-factory/shared-types';
import { MemoryObjectStorage } from '@ai-shorts-factory/storage';
import { SCREENPLAY_SCHEMA_VERSION, type ScreenplayV1 } from '@ai-shorts-factory/validation';
import {
  MemoryGenerationStore,
  MemoryJobQueue,
  SequentialGenerationRunner,
  type JobQueue,
  type WorkflowJobRecord,
} from '@ai-shorts-factory/workflow-engine';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sampleScreenplay(): ScreenplayV1 {
  return {
    schema_version: SCREENPLAY_SCHEMA_VERSION,
    title: 'Worker Smoke',
    category: 'cinematic',
    visual_style: 'realistic_cinematic',
    story_summary: 'Flow-worker smoke screenplay',
    hook: 'Open',
    characters: [{ name: 'Ava', description: 'Lead', visual_identity: 'Red coat' }],
    scenes: [1, 2, 3, 4, 5].map((n) => ({
      scene_number: n,
      title: `Scene ${n}`,
      duration_seconds: 6,
      visual_description: `Visual ${n}`,
      flow_prompt: `Prompt ${n}`,
      narration: '',
      dialogue: '',
      text_overlay: '',
      transition_out: 'cut',
    })),
    ending: 'Done',
    publishing_metadata: { title: 'Worker Smoke', description: 'Test', tags: ['smoke'] },
  };
}

async function processClaimedJob(
  queue: JobQueue,
  runner: SequentialGenerationRunner,
  job: WorkflowJobRecord,
  workerId: string,
): Promise<void> {
  try {
    if (job.jobType === 'GENERATE_PROJECT_SCENES') {
      const result = await runner.runProject(job.userId, job.projectId, { workerId });
      if (result.failed) {
        await queue.fail(job.id, workerId, result.failed);
      } else {
        await queue.complete(job.id, workerId);
      }
      return;
    }
    if (job.jobType === 'VERIFY_SINGLE_SCENE') {
      const result = await runner.runProject(job.userId, job.projectId, {
        workerId,
        maxScenes: 1,
      });
      if (result.failed) {
        await queue.fail(job.id, workerId, result.failed);
      } else {
        await queue.complete(job.id, workerId);
      }
      return;
    }
    if (job.jobType === 'RETRY_SCENE') {
      const sceneNumber = Number(job.payload.sceneNumber);
      const result = await runner.retryScene(job.userId, job.projectId, sceneNumber, {
        workerId,
      });
      if (result.status === 'failed') {
        await queue.fail(job.id, workerId, result.message);
      } else {
        await queue.complete(job.id, workerId);
      }
      return;
    }
    await queue.fail(job.id, workerId, 'Unsupported job type');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Worker failed';
    await queue.fail(job.id, workerId, message);
  }
}

/**
 * Flow worker entrypoint (Phase 4).
 * Claim / lease / complete loop. Live Playwright requires explicit env gates.
 * Prefer `pnpm --filter @ai-shorts-factory/flow-worker verify:scene` for the
 * first human-verified single-scene live run.
 */
async function main(): Promise<void> {
  const enabled = process.env.FLOW_WORKER_ENABLED === 'true';
  const providerName = (process.env.FLOW_PROVIDER ?? 'mock').toLowerCase();
  const keepalive = process.env.FLOW_WORKER_KEEPALIVE === 'true';
  const smoke = process.env.FLOW_WORKER_SMOKE === 'true';
  const workerId = process.env.FLOW_WORKER_ID ?? `flow-worker:${process.pid}`;
  const flowStatus = describeFlowProviderStatus(process.env);

  console.info(
    JSON.stringify({
      service: 'flow-worker',
      phase: PHASE.current,
      enabled,
      provider: providerName,
      keepalive,
      smoke,
      workerId,
      flowStatus,
      defaults: {
        sceneCount: BUSINESS_DEFAULTS.sceneCount,
        costPerScene: BUSINESS_DEFAULTS.estimatedCostPerScene,
        model: BUSINESS_DEFAULTS.defaultGenerationModel,
      },
      note: 'Memory job queue is process-local; web mock generation uses an inline worker tick.',
    }),
  );

  if (!enabled) {
    console.info(
      JSON.stringify({
        service: 'flow-worker',
        message: 'FLOW_WORKER_ENABLED is false. Exiting without claiming jobs.',
      }),
    );
    return;
  }

  if (providerName !== 'mock' && providerName !== 'playwright' && providerName !== 'google-flow') {
    console.error(
      JSON.stringify({
        service: 'flow-worker',
        level: 'error',
        message: `Unsupported FLOW_PROVIDER=${providerName}. Use mock or playwright.`,
      }),
    );
    process.exitCode = 1;
    return;
  }

  if (providerName !== 'mock' && !flowStatus.gatesOk) {
    console.error(
      JSON.stringify({
        service: 'flow-worker',
        level: 'error',
        message: 'Live Flow gates failed',
        reasons: flowStatus.gateReasons,
      }),
    );
    process.exitCode = 1;
    return;
  }

  if (smoke && providerName !== 'mock') {
    console.error(
      JSON.stringify({
        service: 'flow-worker',
        level: 'error',
        message: 'FLOW_WORKER_SMOKE requires FLOW_PROVIDER=mock to avoid live credit spend.',
      }),
    );
    process.exitCode = 1;
    return;
  }

  const queue = new MemoryJobQueue();
  const store = new MemoryGenerationStore();
  const credits = new MemoryCreditLedger({
    dailyBudget: BUSINESS_DEFAULTS.dailyFlowCreditBudget,
  });
  const provider = createVideoGenerationProvider({ env: process.env });
  const storage = new MemoryObjectStorage();
  const runner = new SequentialGenerationRunner(store, credits, provider, storage);

  if (smoke) {
    const projectId = 'smoke-project';
    const userId = 'smoke-user';
    store.seed({
      projectId,
      userId,
      workflowState: 'SCENE_PREPARATION',
      screenplay: sampleScreenplay(),
    });
    await queue.enqueue({
      projectId,
      userId,
      jobType: 'GENERATE_PROJECT_SCENES',
      idempotencyKey: `smoke:${Date.now()}`,
      payload: { mode: 'mock' },
    });
    console.info(
      JSON.stringify({
        service: 'flow-worker',
        message: 'Smoke job enqueued',
        projectId,
      }),
    );
  }

  let idlePasses = 0;
  const maxIdlePasses = keepalive ? Number.POSITIVE_INFINITY : 3;

  while (idlePasses < maxIdlePasses) {
    const job = await queue.claim(workerId, 120);
    if (!job) {
      idlePasses += 1;
      if (keepalive) {
        await sleep(2000);
      }
      continue;
    }

    idlePasses = 0;
    console.info(
      JSON.stringify({
        service: 'flow-worker',
        message: 'Job claimed',
        jobId: job.id,
        jobType: job.jobType,
        projectId: job.projectId,
      }),
    );
    await processClaimedJob(queue, runner, job, workerId);
    const finished = await queue.getById(job.id);
    console.info(
      JSON.stringify({
        service: 'flow-worker',
        message: 'Job finished',
        jobId: job.id,
        state: finished?.state,
        lastError: finished?.lastError,
      }),
    );
  }

  if (provider instanceof GoogleFlowPlaywrightProvider) {
    await provider.dispose();
  }

  console.info(
    JSON.stringify({
      service: 'flow-worker',
      message: keepalive ? 'Keepalive loop ended' : 'Idle; exiting claim loop',
    }),
  );
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      service: 'flow-worker',
      level: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }),
  );
  process.exitCode = 1;
});
