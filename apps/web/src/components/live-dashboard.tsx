'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type LiveDashboardProps = {
  initialConnectedLabel?: string;
};

export function LiveDashboardBanner({ initialConnectedLabel = 'Connecting…' }: LiveDashboardProps) {
  const router = useRouter();
  const [label, setLabel] = useState(initialConnectedLabel);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);

  useEffect(() => {
    if (!('EventSource' in window)) {
      setLabel('Polling fallback');
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background-elevated/50 px-4 py-3 text-sm">
      <div className="space-y-1">
        <p className="font-medium text-foreground">
          Realtime feed · <span className="font-mono text-accent">{label}</span>
        </p>
        <p className="text-muted">
          {lastEventAt
            ? `Last event ${new Date(lastEventAt).toLocaleTimeString()}`
            : 'Waiting for generation, assembly, or intervention events.'}
        </p>
      </div>
      <Link href="/settings" className="text-accent hover:underline">
        Notification settings
      </Link>
    </div>
  );
}
