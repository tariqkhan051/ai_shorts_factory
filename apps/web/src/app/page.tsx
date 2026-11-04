import { BUSINESS_DEFAULTS, PHASE, WORKFLOW_STATES } from '@ai-shorts-factory/shared-types';

const metricCards = [
  {
    label: 'Daily Flow budget',
    value: String(BUSINESS_DEFAULTS.dailyFlowCreditBudget),
    hint: 'Configured default credits / day',
  },
  {
    label: 'Scenes per project',
    value: String(BUSINESS_DEFAULTS.sceneCount),
    hint: 'Exact scene count required',
  },
  {
    label: 'Est. cost / scene',
    value: String(BUSINESS_DEFAULTS.estimatedCostPerScene),
    hint: 'Credits reserved before generation',
  },
  {
    label: 'Max final duration',
    value: `${BUSINESS_DEFAULTS.finalVideoMaxSeconds}s`,
    hint: 'Hard ceiling for assembled MP4',
  },
] as const;

export default function DashboardPage() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
          Phase {PHASE.current} · {PHASE.name}
        </p>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Production control room
        </h1>
        <p className="max-w-2xl text-base text-muted sm:text-lg">
          Turn ideas into reviewed short videos. Foundation shell is live — database, story studio,
          credits, and workers arrive in later phases.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metricCards.map((card) => (
          <article
            key={card.label}
            className="rounded-lg border border-border bg-background-elevated/80 px-4 py-4"
          >
            <p className="text-xs uppercase tracking-wide text-muted">{card.label}</p>
            <p className="mt-2 font-mono text-3xl font-medium text-foreground">{card.value}</p>
            <p className="mt-2 text-sm text-muted">{card.hint}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <article className="rounded-lg border border-border bg-background-elevated/60 p-5">
          <h2 className="text-lg font-medium text-foreground">System status</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <StatusRow label="Web shell" value="Online" tone="success" />
            <StatusRow label="Supabase" value="Not connected (Phase 1)" tone="muted" />
            <StatusRow label="Flow provider" value="Mock only (Phase 0)" tone="warning" />
            <StatusRow label="Flow worker" value="Scaffold — disabled by default" tone="muted" />
            <StatusRow label="Media worker" value="Scaffold — disabled by default" tone="muted" />
            <StatusRow label="Publishing" value="Download / review only" tone="muted" />
          </ul>
        </article>

        <article className="rounded-lg border border-border bg-background-elevated/60 p-5">
          <h2 className="text-lg font-medium text-foreground">Workflow states</h2>
          <p className="mt-1 text-sm text-muted">
            {WORKFLOW_STATES.length} canonical states defined in shared-types.
          </p>
          <div className="mt-4 max-h-64 overflow-auto rounded-md border border-border bg-background/50 p-3 font-mono text-xs leading-6 text-muted">
            {WORKFLOW_STATES.join('\n')}
          </div>
        </article>
      </section>

      <section className="rounded-lg border border-dashed border-border px-5 py-6">
        <h2 className="text-lg font-medium text-foreground">Next up — Phase 1</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Supabase Auth + PostgreSQL migrations, RLS, project CRUD, dashboard data, and the R2
          storage abstraction. No Google Flow credits will be consumed until Phase 4 after a
          verified single-scene integration.
        </p>
      </section>
    </div>
  );
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'muted';
}) {
  const toneClass =
    tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-muted';

  return (
    <li className="flex items-start justify-between gap-4 border-b border-border/60 pb-3 last:border-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span className={`text-right font-medium ${toneClass}`}>{value}</span>
    </li>
  );
}
