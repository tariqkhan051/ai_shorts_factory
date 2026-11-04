import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getAppEnv } from '@/lib/env';
import { getProjectRepository } from '@/lib/projects/repository';

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  const env = getAppEnv();
  const repo = await getProjectRepository();
  const projects = user ? await repo.listByUser(user.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="max-w-2xl text-muted">
            Create and manage production projects. Store mode:{' '}
            <span className="font-mono text-foreground">{env.database.store}</span>
          </p>
        </div>
        <Link
          href="/projects/new"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
        >
          New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-border bg-background-elevated/60 px-4 py-8 text-sm text-muted">
          No projects yet. Submit an idea to start the production workflow.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-background-elevated/40">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex flex-col gap-1 px-4 py-4 transition hover:bg-background/60 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">{project.name}</p>
                  <p className="mt-1 text-sm text-muted">
                    {project.category.replaceAll('_', ' ')} ·{' '}
                    {project.visual_style.replaceAll('_', ' ')}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-mono text-xs uppercase tracking-wide text-accent">
                    {project.workflow_state}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Updated {new Date(project.updated_at).toLocaleString()}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
