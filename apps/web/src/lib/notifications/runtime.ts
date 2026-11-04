import {
  createWebPushSender,
  MemoryNotificationStore,
  MemoryPushSubscriptionStore,
  NotificationEventHub,
  NotificationPublisher,
  readVapidConfig,
  type NotificationPublisher as Publisher,
} from '@ai-shorts-factory/notification';

const globalForNotifications = globalThis as typeof globalThis & {
  __asfNotificationStore?: MemoryNotificationStore;
  __asfPushStore?: MemoryPushSubscriptionStore;
  __asfNotificationHub?: NotificationEventHub;
  __asfNotificationPublisher?: Publisher;
  __asfPushSenderReady?: boolean;
};

export function getNotificationStore(): MemoryNotificationStore {
  if (!globalForNotifications.__asfNotificationStore) {
    globalForNotifications.__asfNotificationStore = new MemoryNotificationStore();
  }
  return globalForNotifications.__asfNotificationStore;
}

export function getPushSubscriptionStore(): MemoryPushSubscriptionStore {
  if (!globalForNotifications.__asfPushStore) {
    globalForNotifications.__asfPushStore = new MemoryPushSubscriptionStore();
  }
  return globalForNotifications.__asfPushStore;
}

export function getNotificationHub(): NotificationEventHub {
  if (!globalForNotifications.__asfNotificationHub) {
    globalForNotifications.__asfNotificationHub = new NotificationEventHub();
  }
  return globalForNotifications.__asfNotificationHub;
}

export async function getNotificationPublisher(): Promise<Publisher> {
  if (!globalForNotifications.__asfNotificationPublisher) {
    const pushSender = await createWebPushSender(process.env);
    globalForNotifications.__asfNotificationPublisher = new NotificationPublisher({
      notifications: getNotificationStore(),
      pushSubscriptions: getPushSubscriptionStore(),
      hub: getNotificationHub(),
      pushSender: pushSender ?? undefined,
    });
    globalForNotifications.__asfPushSenderReady = Boolean(pushSender);
  }
  return globalForNotifications.__asfNotificationPublisher;
}

export function getVapidPublicKey(): string | null {
  return readVapidConfig(process.env)?.publicKey ?? null;
}

export function isWebPushConfigured(): boolean {
  return Boolean(readVapidConfig(process.env));
}
