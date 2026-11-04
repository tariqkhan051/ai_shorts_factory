import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import {
  getCharacterRepository,
  getProjectRepository,
  getReferenceAssetRepository,
} from '@/lib/projects/repository';

export default async function CharacterLibraryPage() {
  const user = await requireUser();
  const charactersRepo = await getCharacterRepository();
  const projectsRepo = await getProjectRepository();
  const referencesRepo = await getReferenceAssetRepository();
  const library = await charactersRepo.listLibrary(user.id);
  const projects = await projectsRepo.listByUser(user.id);

  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));

  const rows = await Promise.all(
    library.map(async (character) => {
      const projectIds = await charactersRepo.listProjectIdsForCharacter(user.id, character.id);
      const refs = await referencesRepo.listByCharacter(user.id, character.id);
      return { character, projectIds, refs };
    }),
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Character library</h1>
        <p className="max-w-2xl text-muted">
          Reusable characters with immutable reference assets. Saving a project character to the
          library makes it available across projects without copying originals.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-background-elevated/60 px-4 py-8 text-sm text-muted">
          Library empty — open a project&apos;s Character Review and use Save to library.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map(({ character, projectIds, refs }) => (
            <li key={character.id} className="flex flex-wrap items-start gap-4 px-4 py-4">
              {refs[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/references/${refs[0].id}`}
                  alt={character.name}
                  className="h-20 w-20 rounded object-cover bg-background"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed border-border text-xs text-muted">
                  No ref
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{character.name}</p>
                <p className="text-sm text-muted">{character.visual_identity}</p>
                <p className="mt-1 font-mono text-xs text-muted">
                  {refs.length} reference(s) · used in{' '}
                  {projectIds.length
                    ? projectIds.map((id) => projectNameById.get(id) ?? id).join(', ')
                    : 'no projects'}
                </p>
              </div>
              {projectIds[0] ? (
                <Link
                  href={`/projects/${projectIds[0]}/characters`}
                  className="text-sm text-accent hover:underline"
                >
                  Open project
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
