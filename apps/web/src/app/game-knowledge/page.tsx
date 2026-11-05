import { PUBLISH_GAME_KNOWLEDGE_PHRASE } from '@ai-shorts-factory/shared-types';
import { requireUser } from '@/lib/auth';
import { getGameKnowledgeRepository } from '@/lib/projects/repository';
import { GameKnowledgeImportForm } from '@/components/game-knowledge-import-form';
import { GameKnowledgePublishForm } from '@/components/game-knowledge-publish-form';

export default async function GameKnowledgePage() {
  const user = await requireUser();
  const knowledge = await getGameKnowledgeRepository();
  const profiles = await knowledge.listProfiles(user.id);

  const patchRows: Array<{
    profileName: string;
    patchId: string;
    patchCode: string;
    environment: string;
    status: string;
    title: string;
  }> = [];

  for (const profile of profiles) {
    const patches = await knowledge.listPatches(user.id, profile.id);
    for (const patch of patches) {
      patchRows.push({
        profileName: profile.name,
        patchId: patch.id,
        patchCode: patch.patch_code,
        environment: patch.server_environment,
        status: patch.status,
        title: patch.title,
      });
    }
  }

  const drafts = patchRows.filter((p) => p.status === 'draft');

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Game knowledge</h1>
        <p className="max-w-2xl text-sm text-muted">
          Import monthly MLBB research as a <strong>draft</strong> patch, review the diff, then
          publish with an explicit confirmation phrase. Original and Advance Server packages stay
          separate. Import never auto-publishes or auto-syncs from ChatGPT.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Import research JSON</h2>
        <GameKnowledgeImportForm />
      </section>

      <section className="space-y-2 rounded-md border border-border p-4 text-sm">
        <h2 className="font-medium">Scheduled artifact pull (Milestone 7)</h2>
        <p className="text-muted">
          Pull operator-provided local research files into <strong>drafts only</strong>. Unchanged
          KB is skipped. Sync never publishes and never calls Moonton APIs. Paid vision/TTS stay
          off unless <code className="font-mono text-xs">MATCH_PAID_VISION_ENABLED</code> /{' '}
          <code className="font-mono text-xs">MATCH_TTS_SPEND_ENABLED</code> are explicitly{' '}
          <code className="font-mono text-xs">true</code>.
        </p>
        <code className="block overflow-x-auto rounded bg-background-elevated p-2 font-mono text-xs">
          pnpm game-knowledge:sync -- --manifest assets/game-knowledge/sync-manifest.sample.json
        </code>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Patches</h2>
        {patchRows.length === 0 ? (
          <p className="text-sm text-muted">No patches yet. Import a sample from assets/game-knowledge.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-background-elevated text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Game</th>
                  <th className="px-3 py-2 font-medium">Environment</th>
                  <th className="px-3 py-2 font-medium">Patch</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Title</th>
                </tr>
              </thead>
              <tbody>
                {patchRows.map((row) => (
                  <tr key={row.patchId} className="border-b border-border/70">
                    <td className="px-3 py-2">{row.profileName}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.environment}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.patchCode}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{row.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {drafts.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Publish draft (human approval)</h2>
          <p className="text-sm text-muted">
            Type <code className="font-mono text-xs">{PUBLISH_GAME_KNOWLEDGE_PHRASE}</code> to
            publish. This cannot be undone; create a new patch_code for later changes.
          </p>
          <div className="space-y-4">
            {drafts.map((draft) => (
              <GameKnowledgePublishForm
                key={draft.patchId}
                patchId={draft.patchId}
                label={`${draft.environment} / ${draft.patchCode}`}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
