import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ENVIRONMENT_KINDS } from '@ai-shorts-factory/shared-types';
import { requireUser } from '@/lib/auth';
import {
  getEnvironmentRepository,
  getProjectRepository,
} from '@/lib/projects/repository';
import { CreateEnvironmentForm } from '@/components/create-environment-form';
import { archiveEnvironmentAction } from '@/app/projects/[id]/environments/actions';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EnvironmentsPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();
  const project = await (await getProjectRepository()).getById(user.id, id);
  if (!project) notFound();

  const environments = await (await getEnvironmentRepository()).listByProject(user.id, id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Link href={`/projects/${id}`} className="text-sm text-muted hover:text-foreground">
          ← {project.name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Environment library</h1>
        <p className="text-sm text-muted">
          Recurring locations, rooms, landscapes, and props — reusable across videos in this
          project.
        </p>
      </div>

      <CreateEnvironmentForm projectId={id} kinds={[...ENVIRONMENT_KINDS]} />

      <section className="space-y-3">
        {environments.length === 0 ? (
          <p className="text-sm text-muted">No environments yet.</p>
        ) : (
          environments.map((env) => (
            <article
              key={env.id}
              className="rounded-lg border border-border bg-background-elevated/50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium">
                    {env.name}{' '}
                    <span className="font-mono text-xs text-muted">({env.kind})</span>
                  </h2>
                  {!env.active ? (
                    <p className="text-xs text-danger">Archived</p>
                  ) : null}
                  <p className="mt-1 text-sm text-muted whitespace-pre-wrap">{env.description}</p>
                  {env.visual_identity ? (
                    <p className="mt-1 text-xs text-muted">Visual: {env.visual_identity}</p>
                  ) : null}
                </div>
                {env.active ? (
                  <form action={archiveEnvironmentAction.bind(null, id, env.id)}>
                    <button
                      type="submit"
                      className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-background"
                    >
                      Archive
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
