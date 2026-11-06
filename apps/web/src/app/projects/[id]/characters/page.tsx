import Link from 'next/link';
import { notFound } from 'next/navigation';
import { scenesForCharacter } from '@ai-shorts-factory/database';
import { AddProjectCharacterPanel } from '@/components/add-project-character-panel';
import { CharacterReviewCard } from '@/components/character-review-card';
import { ProjectWorkflowProgress } from '@/components/project-workflow-progress';
import {
  markCharactersReviewedAction,
  reuseLibraryCharacterAction,
} from '@/app/projects/[id]/characters/actions';
import { requireUser } from '@/lib/auth';
import { charactersMissingReferences } from '@/lib/generation/flow-package';
import {
  getCharacterRepository,
  getProjectRepository,
  getReferenceAssetRepository,
  getStoryRepository,
  getSceneMap,
} from '@/lib/projects/repository';
import {
  buildProjectDashboard,
  getCharacterStudioFocus,
} from '@/lib/projects/workflow-progress';

type PageProps = {
  params: Promise<{ id: string }>;
};

const FOCUS_COPY: Record<
  ReturnType<typeof getCharacterStudioFocus>,
  { title: string; description: string }
> = {
  needs_import: {
    title: 'Import a screenplay first',
    description: 'Characters are created automatically when you import ChatGPT JSON in Story Studio.',
  },
  review: {
    title: 'Review cast details',
    description:
      'Check each character, resolve library conflicts, then mark characters reviewed.',
  },
  references: {
    title: 'Upload primary references',
    description:
      'Add a primary reference image for every character before story approval.',
  },
  done: {
    title: 'Characters ready',
    description: 'References are in place. Continue to approve the story or open Flow Package.',
  },
};

export default async function ProjectCharactersPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();
  const projects = await getProjectRepository();
  const stories = await getStoryRepository();
  const charactersRepo = await getCharacterRepository();
  const referencesRepo = await getReferenceAssetRepository();

  const project = await projects.getById(user.id, id);
  if (!project) notFound();

  const [story, linkedCharacters, library] = await Promise.all([
    stories.getByProject(user.id, id),
    charactersRepo.listByProject(user.id, id),
    charactersRepo.listLibrary(user.id),
  ]);

  const screenplay = story?.current_version?.screenplay ?? null;
  const scenes = getSceneMap().get(id) ?? [];
  const dashboard = buildProjectDashboard({
    project,
    story,
    characters: linkedCharacters,
    scenes,
  });
  const focus = getCharacterStudioFocus(dashboard);
  const copy = FOCUS_COPY[focus];
  const missingRefs = charactersMissingReferences(linkedCharacters);
  const visibleCharacters =
    focus === 'references' && missingRefs.length > 0 ? missingRefs : linkedCharacters;

  const libraryByName = new Map(library.map((c) => [c.name.trim().toLowerCase(), c]));
  const conflicts = linkedCharacters
    .map((character) => {
      const match = libraryByName.get(character.name.trim().toLowerCase());
      if (!match || match.id === character.id || character.in_library) return null;
      return { projectCharacter: character, libraryCharacter: match };
    })
    .filter(Boolean) as Array<{
    projectCharacter: (typeof linkedCharacters)[number];
    libraryCharacter: (typeof library)[number];
  }>;

  const refsByCharacter = new Map<string, Awaited<ReturnType<typeof referencesRepo.listByCharacter>>>();
  await Promise.all(
    visibleCharacters.map(async (character) => {
      refsByCharacter.set(character.id, await referencesRepo.listByCharacter(user.id, character.id));
    }),
  );

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href={`/projects/${project.id}`} className="text-sm text-muted hover:text-foreground">
          ← {project.name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Character Review</h1>
        <p className="max-w-3xl text-muted">{copy.description}</p>
        <p className="font-mono text-xs uppercase tracking-wide text-accent">
          {project.workflow_state}
          {story?.characters_reviewed_at ? ' · characters reviewed' : ''}
        </p>
      </div>

      <ProjectWorkflowProgress stages={dashboard.stages} />

      {focus === 'needs_import' || !screenplay ? (
        <div className="rounded-lg border border-border p-5 text-sm text-muted">
          Import a screenplay in{' '}
          <Link href={`/projects/${project.id}/story`} className="text-accent hover:underline">
            Story Studio
          </Link>{' '}
          first. Characters are created automatically on import.
        </div>
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/5 p-5">
            <div>
              <h2 className="text-lg font-medium">{copy.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {linkedCharacters.length} characters ·{' '}
                {dashboard.charactersMissingReferences} missing primary references
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {focus === 'review' && !story?.characters_reviewed_at ? (
                <form action={markCharactersReviewedAction.bind(null, project.id)}>
                  <button
                    type="submit"
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
                  >
                    Mark characters reviewed
                  </button>
                </form>
              ) : null}
              {focus === 'references' ? (
                <p className="self-center text-sm text-muted">
                  Upload a primary image on each card below.
                </p>
              ) : null}
              {focus === 'done' ? (
                story?.approved_at ? (
                  <Link
                    href={`/projects/${project.id}/flow-package`}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
                  >
                    Open Flow Package →
                  </Link>
                ) : (
                  <Link
                    href={`/projects/${project.id}/story`}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
                  >
                    Continue to approve story →
                  </Link>
                )
              ) : null}
            </div>
          </section>

          {focus === 'review' && conflicts.length > 0 ? (
            <section className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-5">
              <h2 className="text-lg font-medium">Library name conflicts</h2>
              <p className="text-sm text-muted">
                A reusable library character has the same name. Choose explicitly — imports never
                overwrite library characters.
              </p>
              <ul className="space-y-3">
                {conflicts.map(({ projectCharacter, libraryCharacter }) => (
                  <li
                    key={projectCharacter.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{projectCharacter.name}</p>
                      <p className="text-muted">
                        Project copy vs library “{libraryCharacter.name}” (
                        {libraryCharacter.primary_reference_asset_id
                          ? 'has reference'
                          : 'no reference'}
                        )
                      </p>
                    </div>
                    <form
                      action={reuseLibraryCharacterAction.bind(
                        null,
                        project.id,
                        libraryCharacter.id,
                        projectCharacter.screenplay_character_id ?? '',
                        projectCharacter.id,
                      )}
                    >
                      <button
                        type="submit"
                        className="rounded-md border border-border px-3 py-1.5 hover:bg-background"
                      >
                        Reuse library character
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-medium">Cast</h2>
              <p className="text-xs text-muted">
                Expand a character to edit details and references
              </p>
            </div>
            {visibleCharacters.length === 0 ? (
              <p className="text-sm text-muted">No characters linked yet.</p>
            ) : (
              visibleCharacters.map((character) => (
                <CharacterReviewCard
                  key={character.id}
                  projectId={project.id}
                  character={character}
                  defaultOpen={!character.primary_reference_asset_id}
                  sceneNumbers={
                    screenplay
                      ? scenesForCharacter(
                          screenplay,
                          character.screenplay_character_id,
                          character.name,
                        )
                      : []
                  }
                  references={refsByCharacter.get(character.id) ?? []}
                />
              ))
            )}
          </section>

          {focus === 'review' || focus === 'references' ? (
            <AddProjectCharacterPanel projectId={project.id} />
          ) : null}
        </>
      )}
    </div>
  );
}
