import type {
  EventDeliveryRecord,
  EventDeliveryStore,
  OrchestrationRecord,
  OrchestrationStore,
} from './delivery-types.js';

export class MemoryEventDeliveryStore implements EventDeliveryStore {
  private readonly byId = new Map<string, EventDeliveryRecord>();
  private readonly byIdempotency = new Map<string, string>();

  async getByIdempotencyKey(idempotencyKey: string): Promise<EventDeliveryRecord | null> {
    const id = this.byIdempotency.get(idempotencyKey);
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  async getByEventId(eventId: string): Promise<EventDeliveryRecord | null> {
    return this.byId.get(eventId) ?? null;
  }

  async upsert(record: EventDeliveryRecord): Promise<EventDeliveryRecord> {
    const clone = structuredClone(record);
    this.byId.set(clone.id, clone);
    this.byIdempotency.set(clone.event.idempotency_key, clone.id);
    return structuredClone(clone);
  }

  async listRecent(limit = 50): Promise<EventDeliveryRecord[]> {
    return [...this.byId.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }

  async listFailed(limit = 50): Promise<EventDeliveryRecord[]> {
    return [...this.byId.values()]
      .filter((item) => item.status === 'failed' || item.status === 'dead_letter')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }

  async listRetryable(nowIso: string, limit = 50): Promise<EventDeliveryRecord[]> {
    return [...this.byId.values()]
      .filter(
        (item) =>
          item.status === 'failed' &&
          item.nextRetryAt !== null &&
          item.nextRetryAt <= nowIso,
      )
      .sort((a, b) => (a.nextRetryAt ?? '').localeCompare(b.nextRetryAt ?? ''))
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }

  clear(): void {
    this.byId.clear();
    this.byIdempotency.clear();
  }

  exportAll(): EventDeliveryRecord[] {
    return [...this.byId.values()].map((item) => structuredClone(item));
  }

  importAll(records: EventDeliveryRecord[]): void {
    this.clear();
    for (const record of records) {
      this.byId.set(record.id, structuredClone(record));
      this.byIdempotency.set(record.event.idempotency_key, record.id);
    }
  }
}

export class MemoryOrchestrationStore implements OrchestrationStore {
  private readonly byKey = new Map<string, OrchestrationRecord>();

  private key(projectId: string, videoId: string): string {
    return `${projectId}:${videoId}`;
  }

  async get(projectId: string, videoId: string): Promise<OrchestrationRecord | null> {
    const found = this.byKey.get(this.key(projectId, videoId));
    return found ? structuredClone(found) : null;
  }

  async listByProject(projectId: string): Promise<OrchestrationRecord[]> {
    return [...this.byKey.values()]
      .filter((item) => item.projectId === projectId)
      .map((item) => structuredClone(item));
  }

  async upsert(record: OrchestrationRecord): Promise<OrchestrationRecord> {
    const clone = structuredClone(record);
    this.byKey.set(this.key(clone.projectId, clone.videoId), clone);
    return structuredClone(clone);
  }

  clear(): void {
    this.byKey.clear();
  }

  exportAll(): OrchestrationRecord[] {
    return [...this.byKey.values()].map((item) => structuredClone(item));
  }

  importAll(records: OrchestrationRecord[]): void {
    this.clear();
    for (const record of records) {
      this.byKey.set(this.key(record.projectId, record.videoId), structuredClone(record));
    }
  }
}
