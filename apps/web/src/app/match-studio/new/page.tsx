import { requireUser } from '@/lib/auth';
import { getGameKnowledgeRepository } from '@/lib/projects/repository';
import { CreateMatchStudioForm } from '@/components/create-match-studio-form';

export default async function NewMatchStudioPage() {
  const user = await requireUser();
  const knowledge = await getGameKnowledgeRepository();
  const profiles = await knowledge.listProfiles(user.id);

  const options: Array<{
    profileId: string;
    profileName: string;
    patchId: string;
    patchLabel: string;
    environment: string;
  }> = [];

  for (const profile of profiles) {
    const patches = await knowledge.listPatches(user.id, profile.id);
    for (const patch of patches.filter((p) => p.status === 'published')) {
      options.push({
        profileId: profile.id,
        profileName: profile.name,
        patchId: patch.id,
        patchLabel: `${patch.patch_code} (${patch.server_environment})`,
        environment: patch.server_environment,
      });
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">New Match Studio run</h1>
        <p className="max-w-2xl text-sm text-muted">
          Select MLBB profile, Original or Advance environment, and a published patch — or mark the
          patch as unknown (limits KB-backed claims until you bind one).
        </p>
      </header>
      {options.length === 0 ? (
        <p className="rounded-md border border-border p-4 text-sm text-muted">
          No published patches found. Import and publish game knowledge first at /game-knowledge, or
          create a run with patch unknown.
        </p>
      ) : null}
      <CreateMatchStudioForm patchOptions={options} />
    </div>
  );
}
