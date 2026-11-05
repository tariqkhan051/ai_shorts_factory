'use client';

import { useState, useTransition } from 'react';
import type { IntegrationStatusSnapshot, OrchestrationRecord } from '@ai-shorts-factory/n8n-integration';
import {
  orchestrationControlAction,
  retryFailedN8nEventAction,
} from '@/app/projects/[id]/automation/actions';

type Props = {
  projectId: string;
  flowPackageHref: string;
  integration: IntegrationStatusSnapshot;
  orchestration: OrchestrationRecord;
};

export function AutomationPanel({
  projectId,
  flowPackageHref,
  integration,
  orchestration,
}: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: Parameters<typeof orchestrationControlAction>[1]) {
    startTransition(async () => {
      const result = await orchestrationControlAction(projectId, action);
      setMessage(result.message);
    });
  }

  function retry(eventId: string) {
    startTransition(async () => {
      const result = await retryFailedN8nEventAction(projectId, eventId);
      setMessage(result.message);
    });
  }

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-border bg-background-elevated p-4">
        <h2 className="text-lg font-semibold text-foreground">n8n connection</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Enabled</dt>
            <dd className="font-mono">{integration.enabled ? 'yes' : 'no'}</dd>
          </div>
          <div>
            <dt className="text-muted">Configured</dt>
            <dd className="font-mono">{integration.configured ? 'yes' : 'no'}</dd>
          </div>
          <div>
            <dt className="text-muted">Health</dt>
            <dd className="font-mono">{integration.healthy ? 'ok' : 'degraded'}</dd>
          </div>
          <div>
            <dt className="text-muted">Host</dt>
            <dd className="font-mono">{integration.baseUrlHost ?? '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Status</dt>
            <dd>{integration.healthMessage}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Last successful event</dt>
            <dd className="font-mono text-xs">
              {integration.lastSuccessfulEvent
                ? `${integration.lastSuccessfulEvent.eventType} @ ${integration.lastSuccessfulEvent.deliveredAt}`
                : '—'}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          Disabling n8n never blocks Flow Package, manual generation, upload, verification, or
          assembly. Google Flow stays human-controlled in normal Chrome.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-background-elevated p-4">
        <h2 className="text-lg font-semibold text-foreground">Orchestration</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Per-project enabled</dt>
            <dd className="font-mono">{orchestration.enabled ? 'yes' : 'no'}</dd>
          </div>
          <div>
            <dt className="text-muted">Status</dt>
            <dd className="font-mono">{orchestration.status}</dd>
          </div>
          <div>
            <dt className="text-muted">Execution / correlation</dt>
            <dd className="font-mono text-xs break-all">
              {orchestration.executionId ?? '—'} / {orchestration.correlationId ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Current scene</dt>
            <dd className="font-mono">
              {orchestration.currentSceneNumber != null
                ? `#${orchestration.currentSceneNumber}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Verified scenes</dt>
            <dd className="font-mono">
              {orchestration.verifiedSceneCount}/{orchestration.requiredSceneCount}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Last sync</dt>
            <dd className="font-mono text-xs">{orchestration.lastSuccessfulSyncAt ?? '—'}</dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run('enable')}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50"
          >
            Enable
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run('disable')}
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Disable
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run('start')}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50"
          >
            Start
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run('pause')}
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Pause
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run('resume')}
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Resume
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run('cancel')}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <a
            href={flowPackageHref}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background"
          >
            Open Flow Package
          </a>
        </div>
        {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
      </div>

      <div className="rounded-lg border border-border bg-background-elevated p-4">
        <h2 className="text-lg font-semibold text-foreground">Failed webhook deliveries</h2>
        {integration.recentFailures.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No failed deliveries.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {integration.recentFailures.map((item) => (
              <li
                key={item.eventId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-mono text-xs">{item.eventType}</div>
                  <div className="text-muted">
                    attempts={item.attempts} · {item.lastError ?? 'unknown error'}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => retry(item.eventId)}
                  className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                >
                  Retry
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
