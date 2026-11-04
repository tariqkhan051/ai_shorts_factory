import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import { startAssemblyAction } from '@/app/projects/[id]/assemble/actions';
import { requireUser } from '@/lib/auth';
import { AppGenerationStore } from '@/lib/generation/app-generation-store';
import {
  getCharacterRepository,
  getProjectRepository,
  getStoryRepository,
} from '@/lib/projects/repository';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AssemblePage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();
  const projects = await getProjectRepository();
  const stories = await getStoryRepository();
  const characters = await getCharacterRepository();

  const project = await projects.getById(user.id, id);
  if (!project) {
    notFound();
  }

  const story = await stories.getByProject(user.id, id);
  let completedScenes = 0;
  if (story?.approved_at && story.current_version?.screenplay) {
    const store = new AppGenerationStore(projects, stories, characters);
    try {
      const scenes = await store.ensureScenesFromScreenplay(
        user.id,
        id,
        story.current_version.screenplay,
      );
      completedScenes = scenes.filter((scene) => scene.state === 'COMPLETED').length;
    } catch {
      completedScenes = 0;
    }
  }

  const canAssemble =
    completedScenes === BUSINESS_DEFAULTS.sceneCount &&
    (project.workflow_state === 'ASSEMBLY_READY' ||
      project.workflow_state === 'PAUSED' ||
      project.workflow_state === 'FAILED');

  const isComplete =
    project.workflow_state === 'COMPLETED' || project.workflow_state === 'APPROVED';

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href={`/projects/${project.id}`} className="text-sm text-muted hover:text-foreground">
          ← {project.name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Assemble final video</h1>
        <p className="max-w-3xl text-muted">
          FFmpeg concatenates five scenes into a vertical {BUSINESS_DEFAULTS.finalVideoTargetWidth}×
          {BUSINESS_DEFAULTS.finalVideoTargetHeight} MP4 under{' '}
          {BUSINESS_DEFAULTS.finalVideoMaxSeconds}
          s. Mock scene bytes become synthetic placeholders; upscaled frames are not labeled as
          native 1080p generation.
        </p>
        <p className="font-mono text-xs uppercase tracking-wide text-accent">
          {project.workflow_state}
        </p>
      </div>

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5">
        <h2 className="text-lg font-medium">Assembly status</h2>
        <p className="mt-2 text-sm text-muted">
          Completed scenes: {completedScenes}/{BUSINESS_DEFAULTS.sceneCount} · target{' '}
          {BUSINESS_DEFAULTS.finalVideoFps} fps · max {BUSINESS_DEFAULTS.finalVideoMaxSeconds}s
        </p>
        {isComplete ? (
          <p className="mt-3 text-sm text-success">
            Final video assembly completed. Download/review surfaces expand in Phase 6.
          </p>
        ) : null}
        {canAssemble ? (
          <form action={startAssemblyAction.bind(null, project.id)} className="mt-4">
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
            >
              Assemble with FFmpeg
            </button>
          </form>
        ) : !isComplete ? (
          <p className="mt-3 text-sm text-muted">
            Finish mock generation first so the project reaches{' '}
            <span className="font-mono">ASSEMBLY_READY</span>.
          </p>
        ) : null}
        <p className="mt-4 text-xs text-muted">
          Prefer the media-worker for long jobs:{' '}
          <span className="font-mono">
            MEDIA_WORKER_ENABLED=true pnpm --filter @ai-shorts-factory/media-worker start
          </span>
        </p>
      </section>
    </div>
  );
}
