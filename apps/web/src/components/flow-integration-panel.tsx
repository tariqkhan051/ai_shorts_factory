import type { FlowIntegrationSnapshot } from '@/lib/generation/flow-integration';

export function FlowIntegrationPanel({ snapshot }: { snapshot: FlowIntegrationSnapshot }) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-background-elevated/50 p-5">
      <div>
        <h2 className="text-lg font-medium">Flow Integration</h2>
        <p className="mt-1 text-sm text-muted">
          Live Google Flow status, credit posture, and generation history. Mock and real assets are
          labeled separately.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            ['Provider', snapshot.providerLabel],
            ['Session status', snapshot.sessionStatus],
            ['Selected model', snapshot.selectedModel],
            ['Aspect / resolution', `${snapshot.aspectRatio} · ${snapshot.resolution}`],
            ['Clip duration', `${snapshot.durationSeconds}s`],
            ['Canary only', snapshot.canaryOnly ? 'yes' : 'no'],
            ['Max live scenes', String(snapshot.maxLiveScenesPerProject)],
            ['Available budget', String(snapshot.availableBudget)],
            ['Reserved', String(snapshot.reserved)],
            ['Confirmed spending', String(snapshot.confirmedSpent)],
            ['Estimated spending', String(snapshot.estimatedSpent)],
            ['Unknown consumption', String(snapshot.unknownConsumption)],
            ['Live generation status', snapshot.liveGenerationStatus],
            ['Current scene', snapshot.currentScene],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-background/60 px-3 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
            <dd className="mt-1 font-mono text-sm">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-sm text-muted">{snapshot.sessionMessage}</p>
      {!snapshot.gatesOk ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {snapshot.gateReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      <div>
        <h3 className="text-sm font-medium">Generation history</h3>
        {snapshot.history.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No scenes materialized yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {snapshot.history.map((item) => (
              <li key={item.sceneNumber} className="px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Scene {item.sceneNumber}</span>
                  <span className="font-mono text-xs uppercase text-accent">{item.state}</span>
                  {item.assetOrigin ? (
                    <span className="font-mono text-xs uppercase text-muted">{item.assetOrigin}</span>
                  ) : null}
                </div>
                {item.submissionId ? (
                  <p className="mt-1 truncate font-mono text-xs text-muted">{item.submissionId}</p>
                ) : null}
                {item.errorMessage ? <p className="mt-1 text-danger">{item.errorMessage}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
