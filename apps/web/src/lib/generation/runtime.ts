import {
  FileCreditLedger,
  MemoryCreditLedger,
  type CreditLedger,
} from '@ai-shorts-factory/credit-manager';
import { MockVideoGenerationProvider } from '@ai-shorts-factory/flow-adapter';
import {
  MemoryJobQueue,
  SequentialGenerationRunner,
  type JobQueue,
} from '@ai-shorts-factory/workflow-engine';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import { AppGenerationStore } from '@/lib/generation/app-generation-store';
import {
  getCharacterRepository,
  getProjectRepository,
  getStoryRepository,
} from '@/lib/projects/repository';
import { getObjectStorage } from '@/lib/storage';

const globalForGeneration = globalThis as typeof globalThis & {
  __asfCredits?: CreditLedger;
  __asfJobs?: MemoryJobQueue;
  __asfMockProvider?: MockVideoGenerationProvider;
};

export function getCreditLedger(): CreditLedger {
  if (!globalForGeneration.__asfCredits) {
    const useFile = process.env.ASF_CREDIT_LEDGER !== 'memory';
    globalForGeneration.__asfCredits = useFile
      ? new FileCreditLedger({
          dailyBudget: BUSINESS_DEFAULTS.dailyFlowCreditBudget,
        })
      : new MemoryCreditLedger({
          dailyBudget: BUSINESS_DEFAULTS.dailyFlowCreditBudget,
        });
  }
  return globalForGeneration.__asfCredits;
}

export function getJobQueue(): JobQueue {
  if (!globalForGeneration.__asfJobs) {
    globalForGeneration.__asfJobs = new MemoryJobQueue();
  }
  return globalForGeneration.__asfJobs;
}

export function getMockProvider(): MockVideoGenerationProvider {
  if (!globalForGeneration.__asfMockProvider) {
    globalForGeneration.__asfMockProvider = new MockVideoGenerationProvider({
      costPerGeneration: BUSINESS_DEFAULTS.estimatedCostPerScene,
    });
  }
  return globalForGeneration.__asfMockProvider;
}

export async function createGenerationRunner(): Promise<SequentialGenerationRunner> {
  const projects = await getProjectRepository();
  const stories = await getStoryRepository();
  const characters = await getCharacterRepository();
  const store = new AppGenerationStore(projects, stories, characters);
  return new SequentialGenerationRunner(
    store,
    getCreditLedger(),
    getMockProvider(),
    getObjectStorage(),
  );
}
