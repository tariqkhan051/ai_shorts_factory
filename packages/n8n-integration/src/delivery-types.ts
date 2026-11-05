import type { N8nEventEnvelope, N8nEventType } from './events.js';

export const DELIVERY_STATUSES = [
  'pending',
  'delivered',
  'failed',
  'dead_letter',
  'skipped_disabled',
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export type EventDeliveryRecord = {
  id: string;
  event: N8nEventEnvelope;
  status: DeliveryStatus;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  responseStatus: number | null;
};

export type OrchestrationStatus =
  | 'disabled'
  | 'idle'
  | 'running'
  | 'waiting_manual_generation'
  | 'waiting_upload'
  | 'waiting_verification'
  | 'paused'
  | 'cancelled'
  | 'completed'
  | 'failed';

export type OrchestrationRecord = {
  projectId: string;
  videoId: string;
  enabled: boolean;
  status: OrchestrationStatus;
  executionId: string | null;
  correlationId: string | null;
  currentSceneId: string | null;
  currentSceneNumber: number | null;
  verifiedSceneCount: number;
  requiredSceneCount: number;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  pausedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  createdAt: string;
};

export type IntegrationStatusSnapshot = {
  enabled: boolean;
  configured: boolean;
  healthy: boolean;
  healthMessage: string;
  baseUrlHost: string | null;
  workflowId: string | null;
  lastSuccessfulEvent: {
    eventId: string;
    eventType: N8nEventType;
    deliveredAt: string;
    projectId: string;
    videoId: string;
  } | null;
  pendingDeliveries: number;
  failedDeliveries: number;
  deadLetterDeliveries: number;
  recentFailures: Array<{
    eventId: string;
    eventType: N8nEventType;
    lastError: string | null;
    attempts: number;
    updatedAt: string;
  }>;
};

export type EventDeliveryStore = {
  getByIdempotencyKey(idempotencyKey: string): Promise<EventDeliveryRecord | null>;
  getByEventId(eventId: string): Promise<EventDeliveryRecord | null>;
  upsert(record: EventDeliveryRecord): Promise<EventDeliveryRecord>;
  listRecent(limit?: number): Promise<EventDeliveryRecord[]>;
  listFailed(limit?: number): Promise<EventDeliveryRecord[]>;
  listRetryable(nowIso: string, limit?: number): Promise<EventDeliveryRecord[]>;
};

export type OrchestrationStore = {
  get(projectId: string, videoId: string): Promise<OrchestrationRecord | null>;
  listByProject(projectId: string): Promise<OrchestrationRecord[]>;
  upsert(record: OrchestrationRecord): Promise<OrchestrationRecord>;
};
