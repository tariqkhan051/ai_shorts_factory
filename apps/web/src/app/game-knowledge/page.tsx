import { PUBLISH_GAME_KNOWLEDGE_PHRASE } from '@ai-shorts-factory/shared-types';
import { requireUser } from '@/lib/auth';
import { getGameKnowledgeRepository } from '@/lib/projects/repository';
import { getAutonomousKnowledgeEngine } from '@/lib/knowledge-engine/runtime';
import { GameKnowledgeImportForm } from '@/components/game-knowledge-import-form';
import { GameKnowledgePublishForm } from '@/components/game-knowledge-publish-form';
import { KnowledgeEngineDashboard } from '@/components/knowledge-engine-dashboard';

export default async function GameKnowledgePage() {
  const user = await requireUser();
  const knowledge = await getGameKnowledgeRepository({ adoptForUserId: user.id });
  const engine = await getAutonomousKnowledgeEngine();
  const dashboard = engine.getDashboard(user.id);
  const profiles = await knowledge.listProfiles(user.id);

  let heroesSynchronized = 0;
  for (const profile of profiles) {
    const patches = await knowledge.listPatches(user.id, profile.id);
    for (const patch of patches) {
      const heroes = await knowledge.listHeroes(user.id, patch.id);
      heroesSynchronized += heroes.length;
    }
  }

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
          Autonomous MLBB Knowledge Engine maintains heroes, items, and patches in the background.
          Optional manual JSON import remains available for operator research packages. Original and
          Advance Server stay separate. Sync never auto-publishes.
        </p>
      </header>

      <KnowledgeEngineDashboard
        activated={dashboard.state.activated}
        stats={{
          ...dashboard.stats,
          heroes_synchronized: heroesSynchronized || dashboard.stats.heroes_synchronized,
          heroes_discovered: heroesSynchronized || dashboard.stats.heroes_discovered,
        }}
        lastSyncAt={dashboard.state.last_sync_at}
        nextSyncAt={dashboard.state.next_sync_at}
        sources={dashboard.sources.map((source) => ({
          source_key: source.source_key,
          display_name: source.display_name,
          enabled: source.enabled,
          is_community: source.is_community,
          last_success_at: source.last_success_at,
          last_error: source.last_error,
          base_url: source.base_url,
        }))}
        recentJobs={dashboard.recent_jobs.map((job) => ({
          id: job.id,
          kind: job.kind,
          status: job.status,
          error_message: job.error_message,
          created_at: job.created_at,
        }))}
        recentPatches={dashboard.patches.slice(0, 12).map((patch) => ({
          id: patch.id,
          patch_identifier: patch.patch_identifier,
          server_type: patch.server_type,
          first_discovered_at: patch.first_discovered_at,
        }))}
        recentLogs={dashboard.recent_logs.map((log) => ({
          id: log.id,
          level: log.level,
          message: log.message,
          created_at: log.created_at,
        }))}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Optional manual import</h2>
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
