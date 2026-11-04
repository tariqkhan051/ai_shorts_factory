import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProjectForm } from '@/components/project-form';
import { ProjectWorkflowProgress } from '@/components/project-workflow-progress';
import { deleteProjectAction } from '@/app/projects/actions';
import { requireUser } from '@/lib/auth';
import {
  getCharacterRepository,
  getProjectRepository,
  getSceneMap,
  getStoryRepository,
} from '@/lib/projects/repository';
import { buildProjectDashboard } from '@/lib/projects/workflow-progress';
import { projectCreditSummary } from '@/lib/generation/flow-package';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();
  const repo = await getProjectRepository();
  const stories = await getStoryRepository();
  const charactersRepo = await getCharacterRepository();
  const project = await repo.getById(user.id, id);

  if (!project) {
    notFound();
  }

  const [story, characters] = await Promise.all([
    stories.getByProject(user.id, id),
    charactersRepo.listByProject(user.id, id),
  ]);
  const scenes = getSceneMap().get(id) ?? [];
  const credits = projectCreditSummary(scenes, BUSINESS_DEFAULTS.estimatedCostPerScene);
  const dashboard = buildProjectDashboard({
    project,
    story,
    characters,
    scenes,
    estimatedCredits: credits.estimatedProjectCost,
    confirmedCredits: credits.confirmedProjectCost,
    unknownCreditScenes: credits.unknownCreditScenes,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link href="/projects" className="text-sm text-muted hover:text-foreground">
            ← Projects
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
          <p className="font-mono text-xs uppercase tracking-wide text-accent">
            {project.workflow_state}
          </p>
        </div>
        <form action={deleteProjectAction.bind(null, project.id)}>
          <button
            type="submit"
            className="rounded-md border border-danger/40 px-3 py-2 text-sm text-danger hover:bg-danger/10"
          >
            Delete project
          </button>
        </form>
      </div>

      <ProjectWorkflowProgress stages={dashboard.stages} />

      {dashboard.nextAction ? (
        <section className="rounded-lg border border-accent/40 bg-accent/5 p-5">
          <h2 className="text-lg font-medium">Continue</h2>
          <p className="mt-1 text-sm text-muted">{dashboard.nextAction.detail}</p>
          {dashboard.nextAction.available ? (
            <Link
              href={dashboard.nextAction.href}
              className="mt-3 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
            >
              {dashboard.nextAction.actionLabel}
            </Link>
          ) : (
            <p className="mt-3 text-sm text-danger">
              {dashboard.nextAction.blockedReason ?? 'Action unavailable'}
            </p>
          )}
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Characters" value={String(dashboard.characterCount)} />
        <StatCard
          label="Missing references"
          value={String(dashboard.charactersMissingReferences)}
          warn={dashboard.charactersMissingReferences > 0}
        />
        <StatCard label="Scenes" value={String(dashboard.sceneCount || 5)} />
        <StatCard label="Ready for Flow" value={String(dashboard.scenesReadyForFlow)} />
        <StatCard label="Awaiting upload" value={String(dashboard.scenesAwaitingUpload)} />
        <StatCard label="Verified real" value={`${dashboard.verifiedRealScenes}/5`} />
        <StatCard
          label="Est. credits"
          value={String(dashboard.estimatedCredits ?? '—')}
        />
        <StatCard
          label="Confirmed credits"
          value={String(dashboard.confirmedCredits ?? '—')}
        />
        <StatCard
          label="Unknown credit scenes"
          value={String(dashboard.unknownCreditScenes)}
          warn={dashboard.unknownCreditScenes > 0}
        />
      </section>

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5">
        <h2 className="mb-3 text-lg font-medium">Workflow actions</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {dashboard.stages.map((stage) => (
            <div
              key={stage.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-3"
            >
              <div>
                <p className="text-sm font-medium">{stage.label}</p>
                <p className="text-xs text-muted">{stage.detail}</p>
                {stage.blockedReason ? (
                  <p className="text-xs text-danger">{stage.blockedReason}</p>
                ) : null}
              </div>
              {stage.available ? (
                <Link
                  href={stage.href}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background"
                >
                  {stage.actionLabel}
                </Link>
              ) : (
                <span className="text-xs text-muted">Unavailable</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5">
        <h2 className="mb-4 text-lg font-medium">Idea & settings</h2>
        <ProjectForm mode="edit" project={project} />
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background-elevated/50 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 font-mono text-xl ${warn ? 'text-danger' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
