import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getNotificationStore } from '@/lib/notifications/runtime';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const store = getNotificationStore();
  const [items, unreadCount] = await Promise.all([
    store.listByUser(user.id, { limit: 40 }),
    store.unreadCount(user.id),
  ]);
  return NextResponse.json({ items, unreadCount });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    notificationId?: string;
    markAll?: boolean;
  };
  const store = getNotificationStore();
  if (body.markAll) {
    const count = await store.markAllRead(user.id);
    return NextResponse.json({ marked: count });
  }
  if (!body.notificationId) {
    return NextResponse.json({ error: 'notificationId required' }, { status: 400 });
  }
  const updated = await store.markRead(user.id, body.notificationId);
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ item: updated });
}
