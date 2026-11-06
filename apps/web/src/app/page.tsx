import Link from 'next/link';
import { BUSINESS_DEFAULTS, PHASE } from '@ai-shorts-factory/shared-types';
import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconClapper,
  IconCredits,
  IconEmptyInbox,
  IconFolder,
  IconLogIn,
  IconPlus,
  IconSpinner,
  IconStatusDot,
} from '@/components/icons';
import { LiveDashboardBanner } from '@/components/live-dashboard';
import { getCurrentUser } from '@/lib/auth';
import { getAppEnv } from '@/lib/env';
import { getNotificationStore } from '@/lib/notifications/runtime';
import { getProjectRepository } from '@/lib/projects/repository';

function formatWorkflowLabel(state: string) {
  return state.replaceAll('_', ' ').replace(/^\w/, (char) => char.toUpperCase());
}

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
  const notifications = user ? await getNotificationStore().listByUser(user.id, { limit: 8 }) : [];

  const metricCards = [
    {
      label: 'Credits / day',
      value: String(BUSINESS_DEFAULTS.dailyFlowCreditBudget),
      Icon: IconCredits,
      tone: 'accent' as const,
    },
    {
      label: 'In progress',
      value: String(stats.projectsInProgress),
      Icon: IconSpinner,
      tone: 'muted' as const,
    },
    {
      label: 'Completed',
      value: String(stats.completedVideos),
      Icon: IconCheck,
      tone: 'success' as const,
    },
    {
      label: 'Needs you',
      value: String(stats.needsIntervention),
      Icon: IconAlert,
      tone: stats.needsIntervention > 0 ? ('warning' as const) : ('muted' as const),
    },
  ];

  const canCreate = Boolean(user) || !env.supabaseConfigured;

  return (
    <div className="space-y-7 sm:space-y-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
            Phase {PHASE.current}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Dashboard
          </h1>
          <p className="max-w-lg text-sm text-muted sm:text-base">
            Jump back in, or start something new.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate ? (
            <>
              <Link
                href="/projects/new"
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
              >
                <IconPlus className="h-4 w-4" />
                New project
              </Link>
              <Link
                href="/match-studio"
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-background-elevated"
              >
                <IconClapper className="h-4 w-4" />
                Match Studio
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
            >
              <IconLogIn className="h-4 w-4" />
              Sign in
            </Link>
          )}
        </div>
      </section>

      {user ? <LiveDashboardBanner /> : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metricCards.map((card) => {
          const { Icon } = card;
          const toneClass =
            card.tone === 'accent'
              ? 'text-accent'
              : card.tone === 'success'
                ? 'text-success'
                : card.tone === 'warning'
                  ? 'text-warning'
                  : 'text-muted';
          return (
            <article
              key={card.label}
              className="rounded-lg border border-border bg-background-elevated/80 px-3 py-3 sm:px-4 sm:py-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted">{card.label}</p>
                <Icon className={`h-4 w-4 ${toneClass}`} />
              </div>
              <p className="mt-2 font-mono text-2xl font-medium text-foreground sm:text-3xl">
                {card.value}
              </p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <article className="rounded-lg border border-border bg-background-elevated/60 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-base font-medium text-foreground">
              <IconFolder className="h-4 w-4 text-muted" />
              Recent projects
            </h2>
            {canCreate ? (
              <Link
                href="/projects/new"
                className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
              >
                <IconPlus className="h-3.5 w-3.5" />
                New
              </Link>
            ) : null}
          </div>
          {recent.length === 0 ? (
            <div className="mt-5 flex flex-col items-start gap-3">
              <div className="inline-flex items-center gap-2 text-sm text-muted">
                <IconEmptyInbox className="h-4 w-4" />
                No projects yet
              </div>
              {canCreate ? (
                <Link
                  href="/projects/new"
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-background-elevated"
                >
                  <IconPlus className="h-4 w-4" />
                  Create project
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-background-elevated"
                >
                  <IconLogIn className="h-4 w-4" />
                  Sign in
                </Link>
              )}
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {recent.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="group flex items-center gap-3 py-3 hover:text-accent"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
                    <span className="hidden text-xs capitalize text-muted sm:inline">
                      {formatWorkflowLabel(project.workflow_state)}
                    </span>
                    <IconChevronRight className="h-4 w-4 text-muted transition group-hover:text-accent" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-lg border border-border bg-background-elevated/60 p-4 sm:p-5">
          <h2 className="inline-flex items-center gap-2 text-base font-medium text-foreground">
            <IconAlert className="h-4 w-4 text-muted" />
            Alerts
          </h2>
          {notifications.length === 0 ? (
            <p className="mt-5 inline-flex items-center gap-2 text-sm text-muted">
              <IconEmptyInbox className="h-4 w-4" />
              All clear
            </p>
          ) : (
            <ul className="mt-3 space-y-1">
              {notifications.map((item) => {
                const content = (
                  <>
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.body ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.body}</p>
                    ) : null}
                  </>
                );
                return (
                  <li key={item.id} className="rounded-md px-2 py-2 hover:bg-background/50">
                    {item.href ? (
                      <Link href={item.href} className="block hover:text-accent">
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </article>
      </section>

      <section className="rounded-lg border border-border bg-background-elevated/40 px-4 py-3">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <StatusChip
            label="App"
            value="Online"
            tone="success"
          />
          <StatusChip
            label="DB"
            value={env.database.store}
            tone={env.database.store === 'supabase' ? 'success' : 'warning'}
          />
          <StatusChip
            label="Auth"
            value={env.supabaseConfigured ? 'Ready' : 'Off'}
            tone={env.supabaseConfigured ? 'success' : 'muted'}
          />
          <StatusChip
            label="Storage"
            value={env.r2Configured ? 'R2' : 'Memory'}
            tone={env.r2Configured ? 'success' : 'warning'}
          />
          <StatusChip
            label="You"
            value={user ? user.email || user.mode : 'Guest'}
            tone={user ? 'success' : 'muted'}
          />
        </ul>
      </section>
    </div>
  );
}

function StatusChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'muted';
}) {
  return (
    <li className="inline-flex max-w-full items-center gap-2 truncate">
      <IconStatusDot tone={tone} />
      <span className="text-muted">{label}</span>
      <span className="truncate font-medium text-foreground">{value}</span>
    </li>
  );
}
