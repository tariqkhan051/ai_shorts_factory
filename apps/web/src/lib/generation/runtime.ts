import { MemoryCreditLedger } from '@ai-shorts-factory/credit-manager';
import { MockVideoGenerationProvider } from '@ai-shorts-factory/flow-adapter';
import {
  MemoryJobQueue,
  SequentialGenerationRunner,
  type JobQueue,
} from '@ai-shorts-factory/workflow-engine';
import { createObjectStorage } from '@ai-shorts-factory/storage';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import { AppGenerationStore } from '@/lib/generation/app-generation-store';
import {
  getCharacterRepository,
  getProjectRepository,
  getStoryRepository,
} from '@/lib/projects/repository';

const globalForGeneration = globalThis as typeof globalThis & {
  __asfCredits?: MemoryCreditLedger;
  __asfJobs?: MemoryJobQueue;
  __asfMockProvider?: MockVideoGenerationProvider;
};

export function getCreditLedger(): MemoryCreditLedger {
  if (!globalForGeneration.__asfCredits) {
    globalForGeneration.__asfCredits = new MemoryCreditLedger({
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
    createObjectStorage(process.env),
  );
}
