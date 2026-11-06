'use client';

import { useState, useTransition } from 'react';
import {
  activateKnowledgeEngineAction,
  retryFailedKnowledgeJobsAction,
  runPatchMonitorAction,
  syncKnowledgeEngineNowAction,
  toggleKnowledgeSourceAction,
  type KnowledgeEngineActionState,
} from '@/app/game-knowledge/engine-actions';

export type KnowledgeEngineDashboardProps = {
  activated: boolean;
  stats: {
    heroes_discovered: number;
    heroes_synchronized: number;
    items: number;
    patches: number;
    original_status: string;
    advance_status: string;
    failed_jobs: number;
    sources_monitored: number;
    pending_validation: number;
  };
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  sources: Array<{
    source_key: string;
    display_name: string;
    enabled: boolean;
    is_community: boolean;
    last_success_at: string | null;
    last_error: string | null;
    base_url: string;
  }>;
  recentJobs: Array<{
    id: string;
    kind: string;
    status: string;
    error_message: string | null;
    created_at: string;
  }>;
  recentPatches: Array<{
    id: string;
    patch_identifier: string;
    server_type: string;
    first_discovered_at: string;
  }>;
  recentLogs: Array<{
    id: string;
    level: string;
    message: string;
    created_at: string;
  }>;
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background-elevated px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-mono text-sm">{value}</div>
    </div>
  );
}

export function KnowledgeEngineDashboard(props: KnowledgeEngineDashboardProps) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<KnowledgeEngineActionState | null>(null);

  function run(action: () => Promise<KnowledgeEngineActionState>) {
    startTransition(async () => {
      const next = await action();
      setResult(next);
    });
  }

  return (
    <section className="space-y-4 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Autonomous MLBB Knowledge Engine</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Background discovery and ingestion. Portal is for monitoring — not manual hero entry.
            Community wiki data is labeled community-derived. Original and Advance Server stay
            isolated.
          </p>
        </div>
        <div className="text-xs text-muted">
          Status:{' '}
          <span className="font-mono text-foreground">
            {props.activated ? 'activated' : 'inactive'}
          </span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Heroes synchronized" value={props.stats.heroes_synchronized || props.stats.heroes_discovered} />
        <Stat label="Items" value={props.stats.items} />
        <Stat label="Patches tracked" value={props.stats.patches} />
        <Stat label="Sources monitored" value={props.stats.sources_monitored} />
        <Stat label="Original Server" value={props.stats.original_status} />
        <Stat label="Advance Server" value={props.stats.advance_status} />
        <Stat label="Failed jobs" value={props.stats.failed_jobs} />
        <Stat label="Pending validation" value={props.stats.pending_validation} />
        <Stat label="Last sync" value={props.lastSyncAt ?? 'never'} />
        <Stat label="Next scheduled" value={props.nextSyncAt ?? '—'} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() => run(activateKnowledgeEngineAction)}
        >
          Activate engine
        </button>
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          onClick={() => run(syncKnowledgeEngineNowAction)}
        >
          Sync now
        </button>
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          onClick={() => run(runPatchMonitorAction)}
        >
          Run patch monitor
        </button>
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          onClick={() => run(retryFailedKnowledgeJobsAction)}
        >
          Retry failed jobs
        </button>
      </div>

      {result ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            result.ok ? 'border-border bg-background-elevated' : 'border-red-500/40 bg-red-500/5'
          }`}
        >
          <p>{result.message}</p>
          {result.limitations && result.limitations.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-xs text-muted">
              {result.limitations.slice(0, 8).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {result.errors && result.errors.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-xs text-red-400">
              {result.errors.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Sources</h3>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-background-elevated text-muted">
              <tr>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Community</th>
                <th className="px-3 py-2">Last success</th>
                <th className="px-3 py-2">Error</th>
                <th className="px-3 py-2">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {props.sources.map((source) => (
                <tr key={source.source_key} className="border-b border-border/70">
                  <td className="px-3 py-2">
                    <div>{source.display_name}</div>
                    <div className="font-mono text-xs text-muted">{source.base_url}</div>
                  </td>
                  <td className="px-3 py-2">{source.is_community ? 'yes' : 'no'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{source.last_success_at ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted">{source.last_error ?? '—'}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
                      onClick={() =>
                        run(() => toggleKnowledgeSourceAction(source.source_key, !source.enabled))
                      }
                    >
                      {source.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Recent jobs</h3>
          <ul className="space-y-1 text-xs">
            {props.recentJobs.length === 0 ? (
              <li className="text-muted">No jobs yet.</li>
            ) : (
              props.recentJobs.map((job) => (
                <li key={job.id} className="rounded border border-border/70 px-2 py-1 font-mono">
                  {job.kind} · {job.status}
                  {job.error_message ? ` · ${job.error_message}` : ''}
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Recently discovered patches</h3>
          <ul className="space-y-1 text-xs">
            {props.recentPatches.length === 0 ? (
              <li className="text-muted">No patch summaries yet.</li>
            ) : (
              props.recentPatches.map((patch) => (
                <li key={patch.id} className="rounded border border-border/70 px-2 py-1 font-mono">
                  {patch.server_type}/{patch.patch_identifier}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Recent engine logs</h3>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-muted">
          {props.recentLogs.map((log) => (
            <li key={log.id}>
              <span className="font-mono text-foreground">[{log.level}]</span> {log.message}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
