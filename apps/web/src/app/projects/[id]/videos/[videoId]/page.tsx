import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildChatGptProductionPrompt } from '@ai-shorts-factory/chatgpt-import';
import { CopyPromptButton } from '@/components/copy-prompt-button';
import { requireUser } from '@/lib/auth';
import { buildPromptContext } from '@/lib/projects/prompt-context';
import {
  getCharacterRepository,
  getEnvironmentRepository,
  getProjectDnaRepository,
  getProjectRepository,
  getVideoRepository,
} from '@/lib/projects/repository';
import { refreshVideoDnaAction } from '@/app/projects/[id]/videos/actions';

type PageProps = {
  params: Promise<{ id: string; videoId: string }>;
};

export default async function VideoDetailPage({ params }: PageProps) {
  const { id, videoId } = await params;
  const user = await requireUser();
  const projects = await getProjectRepository();
  const project = await projects.getById(user.id, id);
  if (!project) notFound();

  const videos = await getVideoRepository();
  const video = await videos.getById(user.id, videoId);
  if (!video || video.project_id !== id) notFound();

  const [dna, characters, environments] = await Promise.all([
    (await getProjectDnaRepository()).getVersion(user.id, id, video.project_dna_version),
    (await getCharacterRepository()).listByProject(user.id, id),
    (await getEnvironmentRepository()).listByProject(user.id, id),
  ]);

  const prompt = buildChatGptProductionPrompt(
    buildPromptContext({
      project,
      dna: dna?.snapshot,
      dnaVersion: video.project_dna_version,
      video,
      characters,
      environments,
    }),
  );

  const canRefresh =
    !video.approved_at &&
    !['COMPLETED', 'FINAL_APPROVAL', 'APPROVED'].includes(video.workflow_state);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Link href={`/projects/${id}`} className="text-sm text-muted hover:text-foreground">
          ← {project.name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{video.title}</h1>
        <p className="font-mono text-xs uppercase tracking-wide text-accent">
          {video.workflow_state} · DNA v{video.project_dna_version}
        </p>
      </div>

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5 space-y-2">
        <h2 className="text-lg font-medium">Concept</h2>
        <p className="text-sm whitespace-pre-wrap">{video.concept}</p>
        {video.story_brief ? (
          <p className="text-sm text-muted whitespace-pre-wrap">{video.story_brief}</p>
        ) : null}
        {video.special_instructions ? (
          <p className="text-sm text-muted whitespace-pre-wrap">{video.special_instructions}</p>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Inherited context</h2>
          {canRefresh ? (
            <form action={refreshVideoDnaAction.bind(null, id, videoId)}>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background"
              >
                Refresh to current DNA
              </button>
            </form>
          ) : (
            <span className="text-xs text-muted">Approved/completed — snapshot frozen</span>
          )}
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Niche</dt>
            <dd>{video.context_snapshot.content_niche || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">Visual</dt>
            <dd>{video.context_snapshot.visual_style}</dd>
          </div>
          <div>
            <dt className="text-muted">Language</dt>
            <dd>{video.context_snapshot.language}</dd>
          </div>
          <div>
            <dt className="text-muted">Continuity</dt>
            <dd>{video.context_snapshot.continuity_policy}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">ChatGPT screenplay prompt</h2>
          <CopyPromptButton text={prompt} />
        </div>
        <p className="text-sm text-muted">
          Copy into the free ChatGPT website, then import JSON on the project Story Studio. Existing
          character IDs are injected automatically.
        </p>
        <pre className="max-h-80 overflow-auto rounded-md border border-border bg-background p-3 text-xs whitespace-pre-wrap">
          {prompt}
        </pre>
        <Link
          href={`/projects/${id}/story`}
          className="inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
        >
          Open Story Studio
        </Link>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href={`/projects/${id}/characters`}
          className="rounded-md border border-border px-4 py-3 text-sm hover:bg-background-elevated"
        >
          Character library
        </Link>
        <Link
          href={`/projects/${id}/environments`}
          className="rounded-md border border-border px-4 py-3 text-sm hover:bg-background-elevated"
        >
          Environment library
        </Link>
        <Link
          href={`/projects/${id}/videos/${videoId}/distribution`}
          className="rounded-md border border-border px-4 py-3 text-sm hover:bg-background-elevated"
        >
          Distribution
        </Link>
        <Link
          href={`/projects/${id}/flow-package`}
          className="rounded-md border border-border px-4 py-3 text-sm hover:bg-background-elevated"
        >
          Flow package (legacy project path)
        </Link>
      </section>
    </div>
  );
}
