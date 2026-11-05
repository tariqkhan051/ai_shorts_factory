import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProjectForm } from '@/components/project-form';
import { ProjectWorkflowProgress } from '@/components/project-workflow-progress';
import { deleteProjectAction } from '@/app/projects/actions';
import { requireUser } from '@/lib/auth';
import {
  getBrandRepository,
  getCharacterRepository,
  getEnvironmentRepository,
  getProjectDnaRepository,
  getProjectRepository,
  getSceneMap,
  getSocialAccountRepository,
  getStoryRepository,
  getVideoRepository,
} from '@/lib/projects/repository';
import { buildProjectDashboard } from '@/lib/projects/workflow-progress';
import { projectCreditSummary } from '@/lib/generation/flow-package';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';

type PageProps = {
  params: Promise<{ id: string }>;
};

function portfolioBucket(state: string): string {
  if (['FAILED', 'CANCELLED'].includes(state)) return 'failed';
  if (['APPROVED', 'COMPLETED', 'FINAL_APPROVAL'].includes(state)) return 'completed';
  if (['ASSEMBLY_READY', 'ASSEMBLING', 'QUALITY_CHECK'].includes(state)) return 'ready_for_assembly';
  if (['IDEA_SUBMITTED', 'STORY_PROMPT_READY', 'WAITING_FOR_CHATGPT'].includes(state)) {
    return 'draft';
  }
  return 'in_production';
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();
  const repo = await getProjectRepository();
  const project = await repo.getById(user.id, id);
  if (!project) notFound();

  const [
    story,
    characters,
    dna,
    videos,
    environments,
    brand,
    socialAccounts,
  ] = await Promise.all([
    (await getStoryRepository()).getByProject(user.id, id),
    (await getCharacterRepository()).listByProject(user.id, id),
    (await getProjectDnaRepository()).getCurrent(user.id, id),
    (await getVideoRepository()).listByProject(user.id, id),
    (await getEnvironmentRepository()).listByProject(user.id, id),
    project.brand_id
      ? (await getBrandRepository()).getById(user.id, project.brand_id)
      : Promise.resolve(null),
    (await getSocialAccountRepository()).listByProject(user.id, id),
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

  const portfolio = {
    total: videos.length,
    draft: 0,
    in_production: 0,
    ready_for_assembly: 0,
    completed: 0,
    failed: 0,
  };
  for (const video of videos) {
    const bucket = portfolioBucket(video.workflow_state) as keyof typeof portfolio;
    if (bucket in portfolio && bucket !== 'total') {
      portfolio[bucket] += 1;
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link href="/projects" className="text-sm text-muted hover:text-foreground">
            ← Projects
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-sm text-muted">
            {project.niche || dna?.snapshot.identity.content_niche || 'No niche set'} · DNA v
            {project.dna_current_version || dna?.version || 0}
            {brand ? ` · ${brand.name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/projects/${id}/videos/new`}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
          >
            Create New Video
          </Link>
          <form action={deleteProjectAction.bind(null, project.id)}>
            <button
              type="submit"
              className="rounded-md border border-danger/40 px-3 py-2 text-sm text-danger hover:bg-danger/10"
            >
              Delete project
            </button>
          </form>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Videos" value={String(portfolio.total)} />
        <StatCard label="Drafts" value={String(portfolio.draft)} />
        <StatCard label="In production" value={String(portfolio.in_production)} />
        <StatCard label="Completed" value={String(portfolio.completed)} />
        <StatCard label="Characters" value={String(characters.length)} />
        <StatCard label="Environments" value={String(environments.filter((e) => e.active).length)} />
        <StatCard label="Social destinations" value={String(socialAccounts.length)} />
        <StatCard
          label="Est. credits"
          value={String(dashboard.estimatedCredits ?? '—')}
        />
      </section>

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Project DNA</h2>
          <Link href={`/projects/${id}/dna`} className="text-sm text-accent hover:underline">
            Manage DNA
          </Link>
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Visual</dt>
            <dd>{dna?.snapshot.visual.default_visual_style ?? project.visual_style}</dd>
          </div>
          <div>
            <dt className="text-muted">Audience</dt>
            <dd>{dna?.snapshot.identity.target_audience || project.target_audience || '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Universe</dt>
            <dd className="whitespace-pre-wrap">
              {dna?.snapshot.identity.universe_context || project.universe_context || '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Video portfolio</h2>
          <Link
            href={`/projects/${id}/videos/new`}
            className="text-sm text-accent hover:underline"
          >
            New video
          </Link>
        </div>
        {videos.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No videos yet. Create one to inherit Project DNA without restating context.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {videos.map((video) => (
              <li key={video.id}>
                <Link
                  href={`/projects/${id}/videos/${video.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-3 hover:bg-background"
                >
                  <span className="font-medium">{video.title}</span>
                  <span className="font-mono text-xs text-muted">
                    {video.workflow_state} · DNA v{video.project_dna_version}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5">
        <h2 className="mb-3 text-lg font-medium">Quick actions</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: `/projects/${id}/videos/new`, label: 'Create New Video' },
            { href: `/projects/${id}/dna`, label: 'Manage Project DNA' },
            { href: `/projects/${id}/characters`, label: 'Manage Characters' },
            { href: `/projects/${id}/environments`, label: 'Manage Environments' },
            { href: '/social-accounts', label: 'Manage Social Accounts' },
            { href: `/projects/${id}/story`, label: 'Story Studio (legacy path)' },
            { href: `/projects/${id}/flow-package`, label: 'Flow Package' },
            { href: `/projects/${id}/automation`, label: 'Automation (n8n)' },
            { href: `/projects/${id}/assemble`, label: 'Assembly' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      {project.legacy_single_video ? (
        <>
          <ProjectWorkflowProgress stages={dashboard.stages} />
          {dashboard.nextAction ? (
            <section className="rounded-lg border border-accent/40 bg-accent/5 p-5">
              <h2 className="text-lg font-medium">Continue (legacy single-video)</h2>
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
        </>
      ) : null}

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5">
        <h2 className="mb-4 text-lg font-medium">Idea & settings (project surface)</h2>
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
