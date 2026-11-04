import { describe, expect, it, beforeEach } from 'vitest';
import { NotificationEventHub } from './event-hub.js';
import { MemoryNotificationStore } from './memory-notification-store.js';
import { NotificationPublisher } from './publisher.js';
import { MemoryPushSubscriptionStore } from './memory-push-store.js';

describe('MemoryNotificationStore + publisher', () => {
  const store = new MemoryNotificationStore();
  const push = new MemoryPushSubscriptionStore();
  const hub = new NotificationEventHub();

  beforeEach(() => {
    store.clear();
    push.clear();
  });

  it('creates unread notifications and marks them read', async () => {
    const created = await store.create({
      userId: 'u1',
      type: 'info',
      title: 'Hello',
      body: 'World',
    });
    expect(await store.unreadCount('u1')).toBe(1);
    await store.markRead('u1', created.id);
    expect(await store.unreadCount('u1')).toBe(0);
  });

  it('publishes hub events for live dashboard', async () => {
    const events: string[] = [];
    hub.subscribe((event) => events.push(event.kind));
    const publisher = new NotificationPublisher({
      notifications: store,
      pushSubscriptions: push,
      hub,
    });
    await publisher.publish({
      userId: 'u1',
      projectId: 'p1',
      type: 'assembly_completed',
      title: 'Done',
      body: 'Final ready',
      href: '/projects/p1/assemble',
    });
    publisher.publishProjectUpdated('u1', 'p1');
    expect(events).toEqual(['notification', 'project_updated']);
  });
});
