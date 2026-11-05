import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import type { OrchestrationRecord, OrchestrationStatus, OrchestrationStore } from './delivery-types.js';
import { createOrchestrationCorrelationId } from './publisher.js';

export type OrchestrationControlAction =
  | 'enable'
  | 'disable'
  | 'start'
  | 'pause'
  | 'resume'
  | 'cancel';

function nowIso(): string {
  return new Date().toISOString();
}

export function createDefaultOrchestration(
  projectId: string,
  videoId: string,
  enabled = false,
): OrchestrationRecord {
  const timestamp = nowIso();
  return {
    projectId,
    videoId,
    enabled,
    status: enabled ? 'idle' : 'disabled',
    executionId: null,
    correlationId: null,
    currentSceneId: null,
    currentSceneNumber: null,
    verifiedSceneCount: 0,
    requiredSceneCount: BUSINESS_DEFAULTS.sceneCount,
    lastSuccessfulSyncAt: null,
    lastError: null,
    pausedAt: null,
    cancelledAt: null,
    updatedAt: timestamp,
    createdAt: timestamp,
  };
}

export class OrchestrationController {
  constructor(private readonly store: OrchestrationStore) {}

  async getOrCreate(projectId: string, videoId: string): Promise<OrchestrationRecord> {
    const existing = await this.store.get(projectId, videoId);
    if (existing) return existing;
    return this.store.upsert(createDefaultOrchestration(projectId, videoId, false));
  }

  async apply(
    projectId: string,
    videoId: string,
    action: OrchestrationControlAction,
  ): Promise<OrchestrationRecord> {
    const current = await this.getOrCreate(projectId, videoId);
    const timestamp = nowIso();

    switch (action) {
      case 'enable':
        return this.store.upsert({
          ...current,
          enabled: true,
          status: current.status === 'disabled' ? 'idle' : current.status,
          updatedAt: timestamp,
          lastError: null,
        });
      case 'disable':
        return this.store.upsert({
          ...current,
          enabled: false,
          status: 'disabled',
          updatedAt: timestamp,
          pausedAt: null,
        });
      case 'start': {
        if (!current.enabled && action === 'start') {
          // Starting implies enable for this video.
        }
        return this.store.upsert({
          ...current,
          enabled: true,
          status: 'running',
          correlationId: createOrchestrationCorrelationId(projectId, videoId),
          cancelledAt: null,
          pausedAt: null,
          lastError: null,
          updatedAt: timestamp,
        });
      }
      case 'pause':
        return this.store.upsert({
          ...current,
          status: 'paused',
          pausedAt: timestamp,
          updatedAt: timestamp,
        });
      case 'resume':
        return this.store.upsert({
          ...current,
          status: 'running',
          pausedAt: null,
          updatedAt: timestamp,
          lastError: null,
        });
      case 'cancel':
        return this.store.upsert({
          ...current,
          status: 'cancelled',
          cancelledAt: timestamp,
          updatedAt: timestamp,
        });
      default: {
        const _exhaustive: never = action;
        throw new Error(`Unknown orchestration action: ${_exhaustive}`);
      }
    }
  }

  async patch(
    projectId: string,
    videoId: string,
    patch: Partial<
      Pick<
        OrchestrationRecord,
        | 'status'
        | 'executionId'
        | 'currentSceneId'
        | 'currentSceneNumber'
        | 'verifiedSceneCount'
        | 'lastSuccessfulSyncAt'
        | 'lastError'
        | 'correlationId'
      >
    >,
  ): Promise<OrchestrationRecord> {
    const current = await this.getOrCreate(projectId, videoId);
    return this.store.upsert({
      ...current,
      ...patch,
      updatedAt: nowIso(),
    });
  }

  async setWaiting(
    projectId: string,
    videoId: string,
    status: Extract<
      OrchestrationStatus,
      'waiting_manual_generation' | 'waiting_upload' | 'waiting_verification'
    >,
    scene: { sceneId: string; sceneNumber: number },
  ): Promise<OrchestrationRecord> {
    return this.patch(projectId, videoId, {
      status,
      currentSceneId: scene.sceneId,
      currentSceneNumber: scene.sceneNumber,
    });
  }
}
