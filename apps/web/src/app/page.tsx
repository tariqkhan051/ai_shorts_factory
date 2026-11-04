import Link from 'next/link';
import { BUSINESS_DEFAULTS, PHASE } from '@ai-shorts-factory/shared-types';
import { getCurrentUser } from '@/lib/auth';
import { getAppEnv } from '@/lib/env';
import { getProjectRepository } from '@/lib/projects/repository';

export default async function DashboardPage() {
  const env = getAppEnv();
  const user = await getCurrentUser();
  const repo = await getProjectRepository();
  const stats = user
    ? await repo.getDashboardStats(user.id)
    : {
        projectsInProgress: 0,
        completedVideos: 0,
        failedJobs: 0,
        needsIntervention: 0,
      };
  const recent = user ? (await repo.listByUser(user.id)).slice(0, 5) : [];

  const metricCards = [
    {
      label: 'Daily Flow budget',
      value: String(BUSINESS_DEFAULTS.dailyFlowCreditBudget),
      hint: 'Configured default credits / day',
    },
    {
      label: 'Projects in progress',
      value: String(stats.projectsInProgress),
      hint: 'Active non-terminal projects',
    },
    {
      label: 'Completed videos',
      value: String(stats.completedVideos),
      hint: 'Completed / approved outputs',
    },
    {
      label: 'Needs intervention',
      value: String(stats.needsIntervention),
      hint: 'Paused or human-required',
    },
  ] as const;

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
          Create projects, approve screenplays, and run mock sequential scene generation with a
          50-credit daily ledger. Live Google Flow stays off until Phase 4.
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-foreground">Recent projects</h2>
            <Link href="/projects/new" className="text-sm text-accent hover:underline">
              New project
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No projects yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {recent.map((project) => (
                <li key={project.id} className="py-3">
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex items-center justify-between gap-3 hover:text-accent"
                  >
                    <span>{project.name}</span>
                    <span className="font-mono text-xs text-muted">{project.workflow_state}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-lg border border-border bg-background-elevated/60 p-5">
          <h2 className="text-lg font-medium text-foreground">System status</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <StatusRow label="Web shell" value="Online" tone="success" />
            <StatusRow
              label="Data store"
              value={env.database.store}
              tone={env.database.store === 'supabase' ? 'success' : 'warning'}
            />
            <StatusRow
              label="Supabase Auth"
              value={env.supabaseConfigured ? 'Configured' : 'Not configured'}
              tone={env.supabaseConfigured ? 'success' : 'muted'}
            />
            <StatusRow
              label="R2 storage"
              value={env.r2Configured ? 'Configured' : 'Memory fallback'}
              tone={env.r2Configured ? 'success' : 'warning'}
            />
            <StatusRow label="Flow provider" value="Mock only" tone="warning" />
            <StatusRow
              label="Session"
              value={user ? `${user.mode}:${user.email}` : 'Anonymous'}
              tone={user ? 'success' : 'muted'}
            />
          </ul>
        </article>
      </section>

      <section className="rounded-lg border border-dashed border-border px-5 py-6">
        <h2 className="text-lg font-medium text-foreground">Next up — Phase 4</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Verified single-scene Google Flow via Playwright behind the provider interface — only
          after UI confirmation. Mock generation and the credit ledger are available now.
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
      <span className={`max-w-[60%] truncate text-right font-medium ${toneClass}`}>{value}</span>
    </li>
  );
}
