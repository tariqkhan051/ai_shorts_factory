'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconBell, IconEmptyInbox } from '@/components/icons';

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
  const rootRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const markAll = async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAll: true }),
    });
    void refresh();
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-background-elevated hover:text-foreground"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <IconBell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] text-background">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border border-border bg-background-elevated p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Alerts</p>
            {items.length > 0 ? (
              <button
                type="button"
                onClick={() => void markAll()}
                className="min-h-8 text-xs text-accent hover:underline"
              >
                Mark read
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="inline-flex items-center gap-2 py-4 text-sm text-muted">
              <IconEmptyInbox className="h-4 w-4" />
              No alerts
            </p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-auto">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-md px-2.5 py-2 ${item.readAt ? 'opacity-60' : 'bg-background/40'}`}
                >
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="block hover:text-accent"
                      onClick={() => setOpen(false)}
                    >
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.body ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.body}</p>
                      ) : null}
                    </Link>
                  ) : (
                    <>
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.body ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.body}</p>
                      ) : null}
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
