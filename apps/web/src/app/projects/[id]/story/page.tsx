import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildChatGptProductionPrompt } from '@ai-shorts-factory/chatgpt-import';
import { CopyPromptButton } from '@/components/copy-prompt-button';
import { StoryImportForm } from '@/components/story-import-form';
import { ScreenplayEditor } from '@/components/screenplay-editor';
import { CharacterForm } from '@/components/character-form';
import { ProjectWorkflowProgress } from '@/components/project-workflow-progress';
import {
  approveStoryAction,
  deleteCharacterAction,
  loadSampleScreenplayAction,
  markPromptReadyAction,
  markWaitingForChatGptAction,
} from '@/app/projects/[id]/story/actions';
import { requireUser } from '@/lib/auth';
import {
  getCharacterRepository,
  getProjectRepository,
  getSceneMap,
  getStoryRepository,
} from '@/lib/projects/repository';
import { buildProjectDashboard } from '@/lib/projects/workflow-progress';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function StoryStudioPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();
  const projects = await getProjectRepository();
  const stories = await getStoryRepository();
  const characters = await getCharacterRepository();

  const project = await projects.getById(user.id, id);
  if (!project) {
    notFound();
  }

  const [story, linkedCharacters] = await Promise.all([
    stories.getByProject(user.id, id),
    characters.listByProject(user.id, id),
  ]);

  const prompt = buildChatGptProductionPrompt({
    name: project.name,
    category: project.category,
    visual_style: project.visual_style,
    language: project.language,
    target_audience: project.target_audience,
    idea: project.input?.idea ?? '',
    existing_story: project.input?.existing_story,
    additional_instructions: project.input?.additional_instructions,
    character_reference_notes: project.input?.character_reference_notes,
    captions_on_video: project.captions_on_video,
    characters: linkedCharacters.map((character) => ({
      name: character.name,
      description: character.description,
      visual_identity: character.visual_identity,
      clothing: character.clothing,
      appearance_details: character.appearance_details,
      role: character.role,
      age_range: character.age_range,
      continuity_rules: character.continuity_rules,
    })),
  });

  const screenplay = story?.current_version?.screenplay ?? null;
  const canApprove =
    Boolean(screenplay) &&
    !story?.approved_at &&
    Boolean(story?.characters_reviewed_at) &&
    (project.workflow_state === 'STORY_APPROVAL' || project.workflow_state === 'STORY_VALIDATION');

  const dashboard = buildProjectDashboard({
    project,
    story,
    characters: linkedCharacters,
    scenes: getSceneMap().get(project.id) ?? [],
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href={`/projects/${project.id}`} className="text-sm text-muted hover:text-foreground">
          ← {project.name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Story Studio</h1>
        <p className="max-w-3xl text-muted">
          Generate a ChatGPT production prompt, paste the JSON response, review characters and
          references, then approve. No ChatGPT API is used.
          {project.captions_on_video
            ? ' Captions are enabled for this project — the prompt requires a text_overlay on every scene.'
            : ''}
        </p>
        <p className="font-mono text-xs uppercase tracking-wide text-accent">
          {project.workflow_state}
          {story?.approved_at ? ' · approved' : ''}
          {story?.characters_reviewed_at ? ' · characters reviewed' : ''}
          {project.captions_on_video ? ' · captions on' : ''}
        </p>
      </div>

      <ProjectWorkflowProgress stages={dashboard.stages} />

      {screenplay && !story?.characters_reviewed_at ? (
        <div className="rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
          Screenplay imported. Next:{' '}
          <Link
            href={`/projects/${project.id}/characters`}
            className="font-medium text-accent hover:underline"
          >
            Review characters & upload references →
          </Link>
        </div>
      ) : null}

      <section className="space-y-4 rounded-lg border border-border bg-background-elevated/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">1. ChatGPT prompt</h2>
          <div className="flex flex-wrap gap-2">
            <form action={markPromptReadyAction.bind(null, project.id)}>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background"
              >
                Mark prompt ready
              </button>
            </form>
            <form action={markWaitingForChatGptAction.bind(null, project.id)}>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background"
              >
                Waiting for ChatGPT
              </button>
            </form>
            <CopyPromptButton text={prompt} />
          </div>
        </div>
        <pre className="max-h-80 overflow-auto rounded-md border border-border bg-background/70 p-3 font-mono text-xs leading-5 text-muted whitespace-pre-wrap">
          {prompt}
        </pre>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-background-elevated/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">2. Import JSON</h2>
          <form action={loadSampleScreenplayAction.bind(null, project.id)}>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background"
            >
              Load sample screenplay
            </button>
          </form>
        </div>
        <p className="text-sm text-muted">
          Invalid imports are rejected and do not destroy a previously saved screenplay. Successful
          imports create character records automatically.
        </p>
        <StoryImportForm projectId={project.id} />
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-background-elevated/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">3. Characters</h2>
          <Link
            href={`/projects/${project.id}/characters`}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-background hover:bg-accent/90"
          >
            Open Character Review
          </Link>
        </div>
        {linkedCharacters.length === 0 ? (
          <p className="text-sm text-muted">
            No linked characters yet — import a screenplay or add one below.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {linkedCharacters.map((character) => (
              <li
                key={character.id}
                className="flex flex-wrap items-start justify-between gap-3 px-3 py-3"
              >
                <div>
                  <p className="font-medium">{character.name}</p>
                  <p className="text-sm text-muted">{character.visual_identity}</p>
                  <p className="font-mono text-xs text-muted">
                    {character.primary_reference_asset_id
                      ? 'reference-ready'
                      : 'missing primary reference'}
                  </p>
                </div>
                <form action={deleteCharacterAction.bind(null, project.id, character.id)}>
                  <button type="submit" className="text-sm text-danger hover:underline">
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <CharacterForm projectId={project.id} />
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-background-elevated/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">4. Five-scene screenplay</h2>
          <div className="flex flex-wrap gap-2">
            {canApprove ? (
              <form action={approveStoryAction.bind(null, project.id)}>
                <button
                  type="submit"
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
                >
                  Approve story
                </button>
              </form>
            ) : screenplay && !story?.characters_reviewed_at ? (
              <Link
                href={`/projects/${project.id}/characters`}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-background"
              >
                Mark characters reviewed first
              </Link>
            ) : null}
            {story?.approved_at ? (
              <Link
                href={`/projects/${project.id}/flow-package`}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-background"
              >
                Open Flow Package
              </Link>
            ) : null}
          </div>
        </div>
        {!screenplay ? (
          <p className="text-sm text-muted">
            Import a valid five-scene JSON screenplay to unlock editing and approval.
          </p>
        ) : (
          <>
            <div className="rounded-md border border-border bg-background/50 p-3 text-sm text-muted">
              <p>
                <span className="text-foreground">{screenplay.title}</span> ·{' '}
                {screenplay.scenes.length} scenes ·{' '}
                {screenplay.scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0)}s total ·{' '}
                {screenplay.characters.length} characters
              </p>
              <p className="mt-1">{screenplay.publishing_metadata.title}</p>
            </div>
            <ScreenplayEditor projectId={project.id} screenplay={screenplay} />
          </>
        )}
      </section>
    </div>
  );
}
