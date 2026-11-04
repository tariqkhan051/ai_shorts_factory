import { randomUUID } from 'node:crypto';
import type {
  PushSubscriptionRecord,
  PushSubscriptionStore,
  UpsertPushSubscriptionInput,
} from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryPushSubscriptionStore implements PushSubscriptionStore {
  private readonly items = new Map<string, PushSubscriptionRecord>();

  async upsert(input: UpsertPushSubscriptionInput): Promise<PushSubscriptionRecord> {
    const existing = [...this.items.values()].find(
      (item) => item.userId === input.userId && item.endpoint === input.endpoint,
    );
    const timestamp = nowIso();
    if (existing) {
      const updated: PushSubscriptionRecord = {
        ...existing,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? existing.userAgent,
        updatedAt: timestamp,
      };
      this.items.set(existing.id, updated);
      return structuredClone(updated);
    }

    const created: PushSubscriptionRecord = {
      id: randomUUID(),
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.items.set(created.id, created);
    return structuredClone(created);
  }

  async listByUser(userId: string): Promise<PushSubscriptionRecord[]> {
    return [...this.items.values()]
      .filter((item) => item.userId === userId)
      .map((item) => structuredClone(item));
  }

  async deleteByEndpoint(userId: string, endpoint: string): Promise<boolean> {
    const match = [...this.items.values()].find(
      (item) => item.userId === userId && item.endpoint === endpoint,
    );
    if (!match) return false;
    this.items.delete(match.id);
    return true;
  }

  clear(): void {
    this.items.clear();
  }
}
