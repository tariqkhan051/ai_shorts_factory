import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AutomationPanel } from '@/components/automation-panel';
import { requireUser } from '@/lib/auth';
import { resolveVideoIdForProject } from '@/lib/n8n/emit';
import { getN8nPublisher, getOrchestrationController } from '@/lib/n8n/runtime';
import { getProjectRepository } from '@/lib/projects/repository';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectAutomationPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();
  const projects = await getProjectRepository();
  const project = await projects.getById(user.id, id);
  if (!project) notFound();

  const videoId = await resolveVideoIdForProject(user.id, id);
  const [integration, orchestration] = await Promise.all([
    getN8nPublisher().getStatus(),
    getOrchestrationController().getOrCreate(id, videoId),
  ]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <p className="text-sm text-muted">
          <Link href={`/projects/${id}`} className="underline-offset-2 hover:underline">
            ← {project.name}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Automation</h1>
        <p className="mt-1 text-sm text-muted">
          n8n coordinates scene notifications and wait/resume. Google Flow generation stays manual
          in normal Chrome. Application state remains authoritative.
        </p>
      </div>

      <AutomationPanel
        projectId={id}
        flowPackageHref={`/projects/${id}/flow-package`}
        integration={integration}
        orchestration={orchestration}
      />
    </main>
  );
}
