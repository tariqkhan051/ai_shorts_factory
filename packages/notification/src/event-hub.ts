import { randomUUID } from 'node:crypto';
import type { DashboardRealtimeEvent, NotificationHubListener } from './types.js';

/**
 * Process-local pub/sub for dashboard SSE / live refresh.
 * Supabase Realtime can replace this when PROJECT_STORE=supabase.
 */
export class NotificationEventHub {
  private readonly listeners = new Set<NotificationHubListener>();

  subscribe(listener: NotificationHubListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: Omit<DashboardRealtimeEvent, 'id' | 'createdAt'>): DashboardRealtimeEvent {
    const full: DashboardRealtimeEvent = {
      ...event,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    for (const listener of this.listeners) {
      try {
        listener(full);
      } catch {
        // Never let a bad subscriber break publishers.
      }
    }
    return full;
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}
