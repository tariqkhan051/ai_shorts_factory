import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getGameKnowledgeRepository } from '@/lib/projects/repository';
import { CreateMatchStudioForm } from '@/components/create-match-studio-form';

export default async function NewMatchStudioPage() {
  const user = await requireUser();
  const knowledge = await getGameKnowledgeRepository({ adoptForUserId: user.id });
  const profiles = await knowledge.listProfiles(user.id);

  const publishedPatches: Array<{
    profileId: string;
    profileName: string;
    patchId: string;
    patchLabel: string;
    environment: string;
    status: 'published';
  }> = [];
  const draftPatches: Array<{
    profileId: string;
    profileName: string;
    patchId: string;
    patchLabel: string;
    environment: string;
    status: 'draft';
  }> = [];

  for (const profile of profiles) {
    const patches = await knowledge.listPatches(user.id, profile.id);
    for (const patch of patches) {
      const row = {
        profileId: profile.id,
        profileName: profile.name,
        patchId: patch.id,
        patchLabel: `${patch.patch_code} (${patch.server_environment})`,
        environment: patch.server_environment,
      };
      if (patch.status === 'published') {
        publishedPatches.push({ ...row, status: 'published' });
      } else if (patch.status === 'draft') {
        draftPatches.push({ ...row, status: 'draft' });
      }
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

      {profiles.length === 0 ? (
        <p className="rounded-md border border-border p-4 text-sm text-muted">
          No game profiles found. Ingest knowledge via the{' '}
          <Link href="/game-knowledge" className="text-accent underline">
            Autonomous Knowledge Engine
          </Link>{' '}
          or import a package first.
        </p>
      ) : null}

      {profiles.length > 0 && publishedPatches.length === 0 ? (
        <p className="rounded-md border border-border p-4 text-sm text-muted">
          No published patches yet
          {draftPatches.length > 0
            ? ` — ${draftPatches.length} draft patch${draftPatches.length === 1 ? '' : 'es'} ready to review`
            : ''}
          . Publish at{' '}
          <Link href="/game-knowledge" className="text-accent underline">
            /game-knowledge
          </Link>{' '}
          for full KB binding, or create with <strong>Patch unknown</strong> below.
        </p>
      ) : null}

      <CreateMatchStudioForm
        profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
        publishedPatches={publishedPatches}
        draftPatches={draftPatches}
      />
    </div>
  );
}
