export const NOTIFICATION_TYPES = [
  'generation_completed',
  'generation_failed',
  'assembly_completed',
  'assembly_failed',
  'needs_intervention',
  'info',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type AppNotification = {
  id: string;
  userId: string;
  projectId?: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  readAt?: string;
  createdAt: string;
};

export type CreateNotificationInput = {
  userId: string;
  projectId?: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
};

export type PushSubscriptionRecord = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
};

export type UpsertPushSubscriptionInput = {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

export type DashboardRealtimeEvent = {
  id: string;
  userId: string;
  kind: 'notification' | 'project_updated';
  projectId?: string;
  notificationId?: string;
  createdAt: string;
};

export interface NotificationStore {
  create(input: CreateNotificationInput): Promise<AppNotification>;
  listByUser(userId: string, options?: { limit?: number }): Promise<AppNotification[]>;
  markRead(userId: string, notificationId: string): Promise<AppNotification | null>;
  markAllRead(userId: string): Promise<number>;
  unreadCount(userId: string): Promise<number>;
}

export interface PushSubscriptionStore {
  upsert(input: UpsertPushSubscriptionInput): Promise<PushSubscriptionRecord>;
  listByUser(userId: string): Promise<PushSubscriptionRecord[]>;
  deleteByEndpoint(userId: string, endpoint: string): Promise<boolean>;
}

export type NotificationHubListener = (event: DashboardRealtimeEvent) => void;
