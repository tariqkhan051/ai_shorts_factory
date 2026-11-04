import { MockVideoGenerationProvider } from '@ai-shorts-factory/flow-adapter';
import { BUSINESS_DEFAULTS, PHASE } from '@ai-shorts-factory/shared-types';

/**
 * Flow worker entrypoint (Phase 0 scaffold).
 * Job claiming / lease loop lands in Phase 3+.
 * Live Google Flow automation is deferred to Phase 4 after UI verification.
 */
async function main(): Promise<void> {
  const enabled = process.env.FLOW_WORKER_ENABLED === 'true';
  const providerName = process.env.FLOW_PROVIDER ?? 'mock';

  console.info(
    JSON.stringify({
      service: 'flow-worker',
      phase: PHASE.current,
      enabled,
      provider: providerName,
      defaults: {
        sceneCount: BUSINESS_DEFAULTS.sceneCount,
        costPerScene: BUSINESS_DEFAULTS.estimatedCostPerScene,
        model: BUSINESS_DEFAULTS.defaultGenerationModel,
      },
      message: enabled
        ? 'Worker enabled flag set; queue loop not implemented until Phase 3.'
        : 'FLOW_WORKER_ENABLED is false. Exiting without claiming jobs.',
    }),
  );

  if (!enabled) {
    return;
  }

  if (providerName !== 'mock') {
    console.error(
      JSON.stringify({
        service: 'flow-worker',
        level: 'error',
        message: 'Non-mock providers are not available in Phase 0. Set FLOW_PROVIDER=mock.',
      }),
    );
    process.exitCode = 1;
    return;
  }

  const provider = new MockVideoGenerationProvider({
    costPerGeneration: BUSINESS_DEFAULTS.estimatedCostPerScene,
  });
  const availability = await provider.checkAvailability();
  console.info(
    JSON.stringify({
      service: 'flow-worker',
      availability,
      note: 'Queue processing will be implemented in Phase 3.',
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
