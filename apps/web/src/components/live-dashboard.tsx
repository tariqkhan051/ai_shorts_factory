'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconSettings, IconStatusDot } from '@/components/icons';

type LiveDashboardProps = {
  initialConnectedLabel?: string;
};

export function LiveDashboardBanner({ initialConnectedLabel = 'Connecting…' }: LiveDashboardProps) {
  const router = useRouter();
  const [label, setLabel] = useState(initialConnectedLabel);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);

  useEffect(() => {
    if (!('EventSource' in window)) {
      setLabel('Polling');
      const timer = setInterval(() => router.refresh(), 8_000);
      return () => clearInterval(timer);
    }

    const source = new EventSource('/api/notifications/stream');
    source.onopen = () => setLabel('Live');
    source.onerror = () => setLabel('Reconnecting…');
    source.onmessage = (message) => {
      try {
        const payload = JSON.parse(message.data) as {
          type?: string;
          event?: { createdAt?: string; kind?: string };
        };
        if (payload.type === 'connected') {
          setLabel('Live');
        }
        if (payload.type === 'event') {
          setLastEventAt(payload.event?.createdAt ?? new Date().toISOString());
          router.refresh();
        }
      } catch {
        // ignore
      }
    };
    return () => source.close();
  }, [router]);

  const tone =
    label === 'Live' ? 'success' : label === 'Reconnecting…' ? 'warning' : 'accent';

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background-elevated/50 px-3 py-2.5 text-sm">
      <div className="inline-flex min-w-0 items-center gap-2">
        <IconStatusDot tone={tone} className={label === 'Live' ? 'animate-pulse' : undefined} />
        <span className="font-medium text-foreground">{label}</span>
        {lastEventAt ? (
          <span className="truncate text-muted">
            · {new Date(lastEventAt).toLocaleTimeString()}
          </span>
        ) : (
          <span className="truncate text-muted">· waiting for events</span>
        )}
      </div>
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-muted hover:text-accent"
        title="Notification settings"
      >
        <IconSettings className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Settings</span>
      </Link>
    </div>
  );
}
