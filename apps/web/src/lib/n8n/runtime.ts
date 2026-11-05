import {
  DisabledN8nClient,
  FileEventDeliveryStore,
  FileOrchestrationStore,
  MemoryEventDeliveryStore,
  MemoryOrchestrationStore,
  N8nClient,
  N8nEventPublisher,
  OrchestrationController,
  readN8nConfig,
  type EventDeliveryStore,
  type N8nConfig,
  type N8nHttpClient,
  type OrchestrationStore,
} from '@ai-shorts-factory/n8n-integration';

const globalForN8n = globalThis as typeof globalThis & {
  __asfN8nConfig?: N8nConfig;
  __asfN8nDeliveries?: EventDeliveryStore;
  __asfN8nOrchestration?: OrchestrationStore;
  __asfN8nClient?: N8nHttpClient;
  __asfN8nPublisher?: N8nEventPublisher;
  __asfN8nController?: OrchestrationController;
};

function useMemoryStores(): boolean {
  return process.env.ASF_N8N_STATE === 'memory' || process.env.NODE_ENV === 'test';
}

export function getN8nConfig(): N8nConfig {
  if (!globalForN8n.__asfN8nConfig) {
    globalForN8n.__asfN8nConfig = readN8nConfig(process.env);
  }
  return globalForN8n.__asfN8nConfig;
}

export function getN8nDeliveryStore(): EventDeliveryStore {
  if (!globalForN8n.__asfN8nDeliveries) {
    globalForN8n.__asfN8nDeliveries = useMemoryStores()
      ? new MemoryEventDeliveryStore()
      : new FileEventDeliveryStore();
  }
  return globalForN8n.__asfN8nDeliveries;
}

export function getN8nOrchestrationStore(): OrchestrationStore {
  if (!globalForN8n.__asfN8nOrchestration) {
    globalForN8n.__asfN8nOrchestration = useMemoryStores()
      ? new MemoryOrchestrationStore()
      : new FileOrchestrationStore();
  }
  return globalForN8n.__asfN8nOrchestration;
}

export function getN8nClient(): N8nHttpClient {
  if (!globalForN8n.__asfN8nClient) {
    const config = getN8nConfig();
    globalForN8n.__asfN8nClient = config.enabled
      ? new N8nClient(config)
      : new DisabledN8nClient();
  }
  return globalForN8n.__asfN8nClient;
}

export function getN8nPublisher(): N8nEventPublisher {
  if (!globalForN8n.__asfN8nPublisher) {
    globalForN8n.__asfN8nPublisher = new N8nEventPublisher({
      config: getN8nConfig(),
      store: getN8nDeliveryStore(),
      client: getN8nClient(),
    });
  }
  return globalForN8n.__asfN8nPublisher;
}

export function getOrchestrationController(): OrchestrationController {
  if (!globalForN8n.__asfN8nController) {
    globalForN8n.__asfN8nController = new OrchestrationController(getN8nOrchestrationStore());
  }
  return globalForN8n.__asfN8nController;
}

/** Test helper — clears singleton wiring between unit tests. */
export function resetN8nRuntimeForTests(): void {
  delete globalForN8n.__asfN8nConfig;
  delete globalForN8n.__asfN8nDeliveries;
  delete globalForN8n.__asfN8nOrchestration;
  delete globalForN8n.__asfN8nClient;
  delete globalForN8n.__asfN8nPublisher;
  delete globalForN8n.__asfN8nController;
}
