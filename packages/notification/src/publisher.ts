import type { NotificationEventHub } from './event-hub.js';
import type {
  AppNotification,
  CreateNotificationInput,
  NotificationStore,
  PushSubscriptionStore,
} from './types.js';

export type WebPushSender = {
  send(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: { title: string; body: string; href?: string; notificationId: string },
  ): Promise<void>;
};

export type NotificationPublisherOptions = {
  notifications: NotificationStore;
  pushSubscriptions: PushSubscriptionStore;
  hub: NotificationEventHub;
  pushSender?: WebPushSender;
};

/**
 * Creates an in-app notification, emits a realtime event, and optionally sends web push.
 */
export class NotificationPublisher {
  constructor(private readonly options: NotificationPublisherOptions) {}

  async publish(input: CreateNotificationInput): Promise<AppNotification> {
    const notification = await this.options.notifications.create(input);
    this.options.hub.publish({
      userId: input.userId,
      kind: 'notification',
      projectId: input.projectId,
      notificationId: notification.id,
    });

    if (this.options.pushSender) {
      const subs = await this.options.pushSubscriptions.listByUser(input.userId);
      await Promise.allSettled(
        subs.map((sub) =>
          this.options.pushSender!.send(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            {
              title: notification.title,
              body: notification.body,
              href: notification.href,
              notificationId: notification.id,
            },
          ),
        ),
      );
    }

    return notification;
  }

  publishProjectUpdated(userId: string, projectId: string): void {
    this.options.hub.publish({
      userId,
      kind: 'project_updated',
      projectId,
    });
  }
}
