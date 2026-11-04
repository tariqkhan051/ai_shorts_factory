import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProjectForm } from '@/components/project-form';
import { deleteProjectAction } from '@/app/projects/actions';
import { requireUser } from '@/lib/auth';
import { getProjectRepository } from '@/lib/projects/repository';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();
  const repo = await getProjectRepository();
  const project = await repo.getById(user.id, id);

  if (!project) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
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

      <section className="rounded-lg border border-accent/30 bg-background-elevated/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Story Studio</h2>
            <p className="mt-1 text-sm text-muted">
              ChatGPT prompt, JSON import, five-scene editing, characters, and approval.
            </p>
          </div>
          <Link
            href={`/projects/${project.id}/story`}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
          >
            Open Story Studio
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Scene generation</h2>
            <p className="mt-1 text-sm text-muted">
              Mock sequential generation, credit ledger, and the human-in-the-loop Google Flow package.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/projects/${project.id}/flow-package`}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
            >
              Flow package
            </Link>
            <Link
              href={`/projects/${project.id}/generate`}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-background"
            >
              Open generation
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Assemble</h2>
            <p className="mt-1 text-sm text-muted">
              FFmpeg vertical assembly under 59 seconds after five scenes complete.
            </p>
          </div>
          <Link
            href={`/projects/${project.id}/assemble`}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-background"
          >
            Open assemble
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5">
        <h2 className="mb-4 text-lg font-medium">Idea & settings</h2>
        <ProjectForm mode="edit" project={project} />
      </section>
    </div>
  );
}
