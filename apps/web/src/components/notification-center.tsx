'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href?: string;
  readAt?: string;
  createdAt: string;
  type: string;
};

export function NotificationCenter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as {
        items: NotificationItem[];
        unreadCount: number;
      };
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      // ignore transient failures
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!('EventSource' in window)) return;
    const source = new EventSource('/api/notifications/stream');
    source.onmessage = (message) => {
      try {
        const payload = JSON.parse(message.data) as { type?: string };
        if (payload.type === 'event') {
          void refresh();
          router.refresh();
        }
      } catch {
        // ignore malformed events
      }
    };
    return () => source.close();
  }, [refresh, router]);

  const markAll = async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAll: true }),
    });
    void refresh();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-background-elevated hover:text-foreground"
        aria-label="Notifications"
      >
        Alerts
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] text-background">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-lg border border-border bg-background-elevated p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Notifications</p>
            <button
              type="button"
              onClick={() => void markAll()}
              className="text-xs text-accent hover:underline"
            >
              Mark all read
            </button>
          </div>
          {items.length === 0 ? (
            <p className="py-4 text-sm text-muted">No notifications yet.</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-auto">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-md border border-border/70 px-2.5 py-2 ${item.readAt ? 'opacity-70' : ''}`}
                >
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="block hover:text-accent"
                      onClick={() => setOpen(false)}
                    >
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-0.5 text-xs text-muted">{item.body}</p>
                    </Link>
                  ) : (
                    <>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-0.5 text-xs text-muted">{item.body}</p>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
