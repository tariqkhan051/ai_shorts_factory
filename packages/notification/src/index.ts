/**
 * Package: @ai-shorts-factory/notification
 * In-app notifications, realtime hub, and optional web push (Phase 6).
 */

export const PACKAGE_NAME = '@ai-shorts-factory/notification' as const;
export const PACKAGE_PHASE = 6 as const;
export const PACKAGE_STATUS = 'active' as const;

export type {
  NotificationType,
  AppNotification,
  CreateNotificationInput,
  PushSubscriptionRecord,
  UpsertPushSubscriptionInput,
  DashboardRealtimeEvent,
  NotificationStore,
  PushSubscriptionStore,
  NotificationHubListener,
} from './types.js';
export type { WebPushSender, NotificationPublisherOptions } from './publisher.js';
export type { VapidConfig } from './vapid.js';

export { NOTIFICATION_TYPES } from './types.js';
export { MemoryNotificationStore } from './memory-notification-store.js';
export { MemoryPushSubscriptionStore } from './memory-push-store.js';
export { NotificationEventHub } from './event-hub.js';
export { NotificationPublisher } from './publisher.js';
export { readVapidConfig, createWebPushSender } from './vapid.js';

export function getPackageMeta() {
  return {
    name: PACKAGE_NAME,
    phase: PACKAGE_PHASE,
    status: PACKAGE_STATUS,
    description: 'In-app and PWA notification delivery with realtime hub',
  } as const;
}
