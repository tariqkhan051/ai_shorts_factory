import { randomUUID } from 'node:crypto';
import type { AppNotification, CreateNotificationInput, NotificationStore } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryNotificationStore implements NotificationStore {
  private readonly items = new Map<string, AppNotification>();

  async create(input: CreateNotificationInput): Promise<AppNotification> {
    const record: AppNotification = {
      id: randomUUID(),
      userId: input.userId,
      projectId: input.projectId,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href,
      createdAt: nowIso(),
    };
    this.items.set(record.id, record);
    return structuredClone(record);
  }

  async listByUser(userId: string, options?: { limit?: number }): Promise<AppNotification[]> {
    const limit = options?.limit ?? 50;
    return [...this.items.values()]
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }

  async markRead(userId: string, notificationId: string): Promise<AppNotification | null> {
    const current = this.items.get(notificationId);
    if (!current || current.userId !== userId) {
      return null;
    }
    const updated: AppNotification = {
      ...current,
      readAt: current.readAt ?? nowIso(),
    };
    this.items.set(notificationId, updated);
    return structuredClone(updated);
  }

  async markAllRead(userId: string): Promise<number> {
    let count = 0;
    for (const [id, item] of this.items) {
      if (item.userId !== userId || item.readAt) continue;
      this.items.set(id, { ...item, readAt: nowIso() });
      count += 1;
    }
    return count;
  }

  async unreadCount(userId: string): Promise<number> {
    return [...this.items.values()].filter((item) => item.userId === userId && !item.readAt).length;
  }

  clear(): void {
    this.items.clear();
  }
}
