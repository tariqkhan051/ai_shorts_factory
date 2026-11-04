'use client';

import { useEffect, useState } from 'react';

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output.buffer;
}

export function PushEnableButton() {
  const [status, setStatus] = useState<
    'idle' | 'unsupported' | 'missing-vapid' | 'ready' | 'subscribed' | 'error'
  >('idle');
  const [message, setMessage] = useState('Checking push support…');

  useEffect(() => {
    const boot = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setStatus('unsupported');
        setMessage('Push notifications are not supported in this browser.');
        return;
      }
      const vapid = await fetch('/api/push/vapid-public-key').then((res) => res.json());
      if (!vapid.configured || !vapid.publicKey) {
        setStatus('missing-vapid');
        setMessage('Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable web push.');
        return;
      }
      setStatus('ready');
      setMessage('Web push is configured. Enable to receive production alerts.');
    };
    void boot();
  }, []);

  const enable = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('error');
        setMessage('Notification permission was not granted.');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const vapid = await fetch('/api/push/vapid-public-key').then((res) => res.json());
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
      });
      const json = subscription.toJSON();
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });
      if (!response.ok) {
        throw new Error('Subscribe failed');
      }
      setStatus('subscribed');
      setMessage('Push subscription saved for this browser.');
    } catch {
      setStatus('error');
      setMessage('Could not enable push notifications.');
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{message}</p>
      {status === 'ready' || status === 'error' ? (
        <button
          type="button"
          onClick={() => void enable()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
        >
          Enable push notifications
        </button>
      ) : null}
      {status === 'subscribed' ? (
        <p className="text-sm text-success">Subscribed on this device.</p>
      ) : null}
    </div>
  );
}
