import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import {
  getProjectDnaRepository,
  getProjectRepository,
} from '@/lib/projects/repository';
import { CreateVideoForm } from '@/components/create-video-form';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CreateVideoPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();
  const projects = await getProjectRepository();
  const project = await projects.getById(user.id, id);
  if (!project) notFound();

  const dna = await (await getProjectDnaRepository()).getCurrent(user.id, id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <Link href={`/projects/${id}`} className="text-sm text-muted hover:text-foreground">
          ← {project.name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Create New Video</h1>
        <p className="text-sm text-muted">
          Provide only the idea. Niche, visual style, characters, and continuity come from Project
          DNA v{(dna?.version ?? project.dna_current_version) || 1}.
        </p>
      </div>

      {dna ? (
        <section className="rounded-lg border border-border bg-background-elevated/40 px-4 py-3 text-sm">
          <p className="font-medium">Inherits from DNA</p>
          <ul className="mt-2 space-y-1 text-muted">
            <li>Niche: {dna.snapshot.identity.content_niche || '—'}</li>
            <li>Visual: {dna.snapshot.visual.default_visual_style}</li>
            <li>Audience: {dna.snapshot.identity.target_audience || '—'}</li>
            <li>
              Captions:{' '}
              {dna.snapshot.production_defaults.captions_on_video ? 'on' : 'off'}
            </li>
          </ul>
        </section>
      ) : (
        <p className="text-sm text-danger">
          Project DNA is not initialized.{' '}
          <Link href={`/projects/${id}/dna`} className="underline">
            Manage DNA
          </Link>{' '}
          first.
        </p>
      )}

      <CreateVideoForm projectId={id} disabled={!dna} />
    </div>
  );
}
