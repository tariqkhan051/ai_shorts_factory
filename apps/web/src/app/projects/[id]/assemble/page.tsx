import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import { startAssemblyAction } from '@/app/projects/[id]/assemble/actions';
import { AssemblyDownloadPanel } from '@/components/assembly-download-panel';
import { requireUser } from '@/lib/auth';
import { getAssemblyRecordStore } from '@/lib/assembly/runtime';
import { evaluateAssemblyGate } from '@/lib/generation/assembly-gate';
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
  let verifiedRealScenes = 0;
  let gateMode: 'real' | 'mock' | 'undetermined' = 'undetermined';
  let gateMessage: string | null = null;
  if (story?.approved_at && story.current_version?.screenplay) {
    const store = new AppGenerationStore(projects, stories, characters);
    try {
      const scenes = await store.ensureScenesFromScreenplay(
        user.id,
        id,
        story.current_version.screenplay,
      );
      verifiedRealScenes = scenes.filter(
        (scene) =>
          scene.state === 'REAL_GENERATED' || scene.state === 'READY_FOR_ASSEMBLY',
      ).length;
      const gate = evaluateAssemblyGate(scenes);
      if (gate.ok) {
        completedScenes = gate.scenes.length;
        gateMode = gate.mode;
      } else {
        gateMode = gate.mode;
        completedScenes = scenes.filter(
          (scene) =>
            scene.state === 'COMPLETED' ||
            scene.state === 'REAL_GENERATED' ||
            scene.state === 'READY_FOR_ASSEMBLY',
        ).length;
        // Prompt-ready Flow scenes are not an assembly failure — operator still needs uploads.
        if (verifiedRealScenes < BUSINESS_DEFAULTS.sceneCount && completedScenes === 0) {
          gateMessage = `Upload and verify ${BUSINESS_DEFAULTS.sceneCount} real Flow MP4s on the Flow Package page first (${verifiedRealScenes}/${BUSINESS_DEFAULTS.sceneCount} ready). Prompt-ready / awaiting-generation scenes are not assembly assets.`;
        } else if (verifiedRealScenes < BUSINESS_DEFAULTS.sceneCount) {
          gateMessage = `Need ${BUSINESS_DEFAULTS.sceneCount} verified REAL_GENERATED scenes before assembly (${verifiedRealScenes}/${BUSINESS_DEFAULTS.sceneCount} ready). Open Flow Package to upload remaining MP4s.`;
        } else {
          gateMessage = gate.message;
        }
      }
    } catch {
      completedScenes = 0;
    }
  }

  const assembly = await getAssemblyRecordStore().getByProject(user.id, id);
  const scenesReady = gateMode === 'real' || gateMode === 'mock';
  const canAssemble =
    scenesReady &&
    !gateMessage &&
    (project.workflow_state === 'ASSEMBLY_READY' ||
      project.workflow_state === 'PAUSED' ||
      project.workflow_state === 'FAILED' ||
      project.workflow_state === 'COMPLETED');
  const isComplete = assembly?.status === 'completed';
  const isFailed = assembly?.status === 'failed';
  const videoSrc = `/api/projects/${project.id}/assembly/video`;
  const publishing = story?.current_version?.screenplay?.publishing_metadata ?? null;

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
          {BUSINESS_DEFAULTS.finalVideoMaxSeconds}s. Real assembly requires five distinct
          REAL_GENERATED imports (no mock mix, no synthetic placeholders). Mock assembly remains
          available for COMPLETED mock scenes and is labeled synthetic.
          {project.captions_on_video
            ? ' On-screen captions from each scene’s text overlay will be burned into the final video.'
            : ''}
        </p>
        <p className="font-mono text-xs uppercase tracking-wide text-accent">
          {project.workflow_state}
          {project.captions_on_video ? ' · captions on' : ''}
        </p>
      </div>

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Scene readiness</h2>
          <p className="font-mono text-sm text-muted">
            {completedScenes}/{BUSINESS_DEFAULTS.sceneCount} · mode {gateMode}
          </p>
        </div>
        {gateMessage ? (
          <div className="mt-3 space-y-3 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm text-muted">
            <p className="whitespace-pre-wrap text-foreground">{gateMessage}</p>
            <Link
              href={`/projects/${project.id}/flow-package`}
              className="inline-flex rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-background hover:bg-accent/90"
            >
              Open Flow Package
            </Link>
          </div>
        ) : null}
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

          {publishing ? (
            <AssemblyDownloadPanel
              projectId={project.id}
              videoSrc={videoSrc}
              title={publishing.title}
              description={publishing.description}
              tags={publishing.tags}
            />
          ) : (
            <div className="flex flex-wrap gap-3">
              <a
                href={`${videoSrc}?download=1`}
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
              <p className="w-full text-sm text-warning">
                No publishing metadata on this screenplay yet — re-import or edit the story to add
                title, description, and tags.
              </p>
            </div>
          )}

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
            Assembly unlocks after five verified scene videos are ready (real Flow uploads preferred;
            mock COMPLETED scenes only for the synthetic/mock path).
          </p>
        ) : null}
      </section>
    </div>
  );
}
