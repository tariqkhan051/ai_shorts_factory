'use client';

import { useState, useTransition } from 'react';
import {
  confirmLiveCanarySpendAction,
  prepareLiveCanaryPreflightAction,
  type LiveCanaryPreflight,
} from '@/app/projects/[id]/generate/actions';

type LiveCanaryPanelProps = {
  projectId: string;
  liveConfigured: boolean;
};

export function LiveCanaryPanel({ projectId, liveConfigured }: LiveCanaryPanelProps) {
  const [pending, startTransition] = useTransition();
  const [preflight, setPreflight] = useState<LiveCanaryPreflight | null>(null);
  const [phrase, setPhrase] = useState('');
  const [authorizedCommand, setAuthorizedCommand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="space-y-4 rounded-lg border border-warning/40 bg-warning/5 p-5">
      <div>
        <h2 className="text-lg font-medium">Live canary (Scene 1 only)</h2>
        <p className="mt-1 text-sm text-muted">
          Real Google Flow credits. This panel never auto-submits. Preflight first, type{' '}
          <span className="font-mono">SPEND_REAL_CREDITS</span>, then run the flow-worker canary
          command with <span className="font-mono">FLOW_EXECUTE_LIVE=true</span>.
        </p>
      </div>

      {!liveConfigured ? (
        <p className="text-sm text-muted">
          Configure <span className="font-mono">FLOW_PROVIDER=google-flow</span>, live gates, and a
          verified UI recipe in Settings before canary preflight.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-background-elevated disabled:opacity-50"
            onClick={() => {
              setError(null);
              setMessage(null);
              setAuthorizedCommand(null);
              startTransition(async () => {
                try {
                  const report = await prepareLiveCanaryPreflightAction(projectId);
                  setPreflight(report);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Preflight failed');
                }
              });
            }}
          >
            {pending ? 'Working…' : 'Prepare canary preflight'}
          </button>
        </div>
      )}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}

      {preflight ? (
        <div className="space-y-3 rounded-md border border-border bg-background/70 p-4 text-sm">
          <p className="font-medium text-foreground">Preflight report — no credits spent yet</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-muted">Scene prompt</dt>
              <dd className="mt-1 whitespace-pre-wrap text-foreground">{preflight.prompt}</dd>
            </div>
            <div className="space-y-2">
              <p>
                <span className="text-muted">Model:</span> {preflight.model}
              </p>
              <p>
                <span className="text-muted">Aspect:</span> {preflight.aspectRatio}
              </p>
              <p>
                <span className="text-muted">Resolution:</span> {preflight.resolution}
              </p>
              <p>
                <span className="text-muted">Duration:</span> {preflight.durationSeconds}s
              </p>
              <p>
                <span className="text-muted">Expected cost:</span> {String(preflight.estimatedCreditCost)}
              </p>
              <p>
                <span className="text-muted">Spendable:</span> {preflight.spendableCredits}
              </p>
              <p>
                <span className="text-muted">Session:</span> {preflight.sessionStatus}
              </p>
            </div>
          </dl>
          {preflight.warnings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-warning">
              {preflight.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-wide text-muted">
              Type {preflight.confirmPhrase} to authorize Scene 1 only
            </span>
            <input
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
              placeholder={preflight.confirmPhrase}
              autoComplete="off"
            />
          </label>

          <button
            type="button"
            disabled={pending || phrase.trim().length === 0}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90 disabled:opacity-50"
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  const result = await confirmLiveCanarySpendAction(
                    projectId,
                    preflight.confirmationToken,
                    phrase,
                  );
                  setMessage(result.message);
                  setAuthorizedCommand(result.workerCommand);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Confirmation failed');
                }
              });
            }}
          >
            Authorize Scene 1 spend (still does not submit)
          </button>

          {authorizedCommand ? (
            <div className="space-y-2">
              <p className="text-success">
                Authorized. Run this in a terminal (add FLOW_EXECUTE_LIVE=true only when ready to
                spend):
              </p>
              <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-xs">
                {`FLOW_EXECUTE_LIVE=true ${authorizedCommand}`}
              </pre>
            </div>
          ) : (
            <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-xs">
              {preflight.workerCommand}
            </pre>
          )}
        </div>
      ) : null}
    </section>
  );
}
