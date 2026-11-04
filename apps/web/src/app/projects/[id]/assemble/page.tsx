import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import { startAssemblyAction } from '@/app/projects/[id]/assemble/actions';
import { requireUser } from '@/lib/auth';
import { getAssemblyRecordStore } from '@/lib/assembly/runtime';
import { AppGenerationStore } from '@/lib/generation/app-generation-store';
import {
  getCharacterRepository,
  getProjectRepository,
  getStoryRepository,
} from '@/lib/projects/repository';

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

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

  const assembly = await getAssemblyRecordStore().getByProject(user.id, id);
  const scenesReady = completedScenes === BUSINESS_DEFAULTS.sceneCount;
  const canAssemble =
    scenesReady &&
    (project.workflow_state === 'ASSEMBLY_READY' ||
      project.workflow_state === 'PAUSED' ||
      project.workflow_state === 'FAILED' ||
      project.workflow_state === 'COMPLETED');
  const isComplete = assembly?.status === 'completed';
  const isFailed = assembly?.status === 'failed';
  const videoSrc = `/api/projects/${project.id}/assembly/video`;
  const downloadSrc = `${videoSrc}?download=1`;

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
          {BUSINESS_DEFAULTS.finalVideoMaxSeconds}s. Mock scene bytes become synthetic placeholders;
          they are never labeled as real AI-generated or native 1080p Flow footage.
        </p>
        <p className="font-mono text-xs uppercase tracking-wide text-accent">
          {project.workflow_state}
        </p>
      </div>

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Scene readiness</h2>
          <p className="font-mono text-sm text-muted">
            {completedScenes}/{BUSINESS_DEFAULTS.sceneCount} completed
          </p>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-2">
          {Array.from({ length: BUSINESS_DEFAULTS.sceneCount }, (_, index) => {
            const done = index < completedScenes;
            return (
              <div
                key={index}
                className={`rounded-md border px-2 py-3 text-center text-xs font-mono ${
                  done
                    ? 'border-success/40 bg-success/10 text-success'
                    : 'border-border text-muted'
                }`}
              >
                S{index + 1}
                <div>{done ? 'done' : 'pending'}</div>
              </div>
            );
          })}
        </div>
      </section>

      {isComplete && assembly ? (
        <section className="space-y-4 rounded-lg border border-border bg-background-elevated/50 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-medium text-success">Assembly completed</h2>
            {assembly.usedSyntheticPlaceholders ? (
              <span className="rounded border border-warning/50 bg-warning/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-warning">
                Mock / synthetic asset
              </span>
            ) : null}
          </div>

          <div className="mx-auto w-full max-w-sm overflow-hidden rounded-lg border border-border bg-black">
            <video
              key={assembly.updatedAt}
              controls
              playsInline
              preload="metadata"
              className="aspect-[9/16] w-full"
              src={videoSrc}
            >
              Your browser does not support video playback.
            </video>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={downloadSrc}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
            >
              Download MP4
            </a>
            <a
              href={videoSrc}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-background"
            >
              Open in new tab
            </a>
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Duration</dt>
              <dd className="font-mono">
                {assembly.durationSeconds?.toFixed(2) ?? '—'}s
              </dd>
            </div>
            <div>
              <dt className="text-muted">Resolution</dt>
              <dd className="font-mono">
                {assembly.width}×{assembly.height}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Frame rate</dt>
              <dd className="font-mono">{assembly.fps ?? '—'} fps</dd>
            </div>
            <div>
              <dt className="text-muted">File size</dt>
              <dd className="font-mono">{formatBytes(assembly.fileSizeBytes)}</dd>
            </div>
            <div>
              <dt className="text-muted">Codecs</dt>
              <dd className="font-mono">
                {assembly.videoCodec ?? '—'} / {assembly.audioCodec ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Completed at</dt>
              <dd className="font-mono text-xs">{assembly.completedAt ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted">Storage key</dt>
              <dd className="break-all font-mono text-xs">{assembly.storageKey ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted">Local durable path</dt>
              <dd className="break-all font-mono text-xs">{assembly.localPath ?? '—'}</dd>
            </div>
          </dl>

          {assembly.upscaledFromLowerResolution ? (
            <p className="text-sm text-warning">
              Honesty: target canvas via scale/pad — not native 1080p generation.
            </p>
          ) : null}
          {assembly.usedSyntheticPlaceholders ? (
            <p className="text-sm text-warning">
              Honesty: synthetic mock placeholders — not real AI-generated Flow video.
            </p>
          ) : null}
        </section>
      ) : null}

      {isFailed && assembly ? (
        <section className="rounded-lg border border-danger/40 bg-danger/5 p-5">
          <h2 className="text-lg font-medium text-danger">Assembly failed</h2>
          <p className="mt-2 font-mono text-sm text-muted">{assembly.error ?? 'Unknown error'}</p>
          <p className="mt-2 text-xs text-muted">Updated {assembly.updatedAt}</p>
          {canAssemble ? (
            <form action={startAssemblyAction.bind(null, project.id)} className="mt-4">
              <button
                type="submit"
                className="rounded-md border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/20"
              >
                Retry assembly
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5">
        <h2 className="text-lg font-medium">Assemble</h2>
        <p className="mt-2 text-sm text-muted">
          Target {BUSINESS_DEFAULTS.finalVideoFps} fps · max{' '}
          {BUSINESS_DEFAULTS.finalVideoMaxSeconds}s · durable write to{' '}
          <span className="font-mono">.data/assemblies/{'{projectId}'}/</span>
        </p>
        {canAssemble ? (
          <form action={startAssemblyAction.bind(null, project.id)} className="mt-4">
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
            >
              {isComplete || isFailed ? 'Re-run assembly' : 'Assemble with FFmpeg'}
            </button>
          </form>
        ) : !isComplete ? (
          <p className="mt-3 text-sm text-muted">
            Finish mock generation first so five scenes are completed and the project can assemble.
          </p>
        ) : null}
      </section>
    </div>
  );
}
