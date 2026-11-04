import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  describeFlowProviderStatus,
  isLiveFlowProviderName,
  isSceneReadyForAssembly,
} from '@ai-shorts-factory/flow-adapter';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import {
  retryFailedSceneAction,
  startMockGenerationAction,
} from '@/app/projects/[id]/generate/actions';
import { CopyPromptButton } from '@/components/copy-prompt-button';
import { FlowIntegrationPanel } from '@/components/flow-integration-panel';
import { LiveCanaryPanel } from '@/components/live-canary-panel';
import { ManualSceneUpload } from '@/components/manual-scene-upload';
import { requireUser } from '@/lib/auth';
import { AppGenerationStore } from '@/lib/generation/app-generation-store';
import { buildFlowIntegrationSnapshot } from '@/lib/generation/flow-integration';
import { getCreditLedger } from '@/lib/generation/runtime';
import {
  getCharacterRepository,
  getProjectRepository,
  getStoryRepository,
} from '@/lib/projects/repository';

type PageProps = {
  params: Promise<{ id: string }>;
};

const GENERATION_START_STATES = new Set([
  'SCENE_PREPARATION',
  'READY_FOR_GENERATION',
  'CREDIT_RESERVED',
  'PAUSED',
  'NEEDS_HUMAN_INTERVENTION',
  'FAILED',
  'GENERATING_SCENES',
  'VERIFYING_SCENES',
]);

export default async function GeneratePage({ params }: PageProps) {
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
  const approved = Boolean(story?.approved_at && story.current_version?.screenplay);
  const credits = await getCreditLedger().getBalances(user.id);
  const flow = describeFlowProviderStatus(process.env);

  let scenes: Awaited<ReturnType<AppGenerationStore['ensureScenesFromScreenplay']>> = [];
  let snapshotError: string | null = null;
  if (approved && story?.current_version?.screenplay) {
    try {
      const store = new AppGenerationStore(projects, stories, characters);
      scenes = await store.ensureScenesFromScreenplay(
        user.id,
        id,
        story.current_version.screenplay,
      );
    } catch (error) {
      snapshotError = error instanceof Error ? error.message : 'Unable to load scenes';
    }
  }

  const completedCount = scenes.filter(
    (scene) =>
      scene.state === 'COMPLETED' ||
      scene.state === 'REAL_GENERATED' ||
      scene.state === 'READY_FOR_ASSEMBLY',
  ).length;
  const canStart =
    approved &&
    GENERATION_START_STATES.has(project.workflow_state) &&
    completedCount < BUSINESS_DEFAULTS.sceneCount;
  const assemblyReady = project.workflow_state === 'ASSEMBLY_READY';
  const integration = buildFlowIntegrationSnapshot({ credits, scenes });
  const liveConfigured = isLiveFlowProviderName(flow.provider) && flow.liveEnabled;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href={`/projects/${project.id}`} className="text-sm text-muted hover:text-foreground">
          ← {project.name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Scene generation</h1>
        <p className="max-w-3xl text-muted">
          Sequential generation with immutable credit ledger. Mock mode remains the default product
          path. Real Google Flow uses the human-in-the-loop Generation Package (no Playwright Generate).
        </p>
        <p className="font-mono text-xs uppercase tracking-wide text-accent">
          {project.workflow_state}
        </p>
      </div>

      <FlowIntegrationPanel snapshot={integration} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CreditStat label="Spendable" value={credits.spendable} />
        <CreditStat label="Reserved" value={credits.reserved} />
        <CreditStat label="Confirmed spent" value={credits.confirmedSpent} />
        <CreditStat label="Unknown" value={credits.unknownConsumption} />
      </section>

      {!approved ? (
        <section className="rounded-lg border border-warning/40 bg-warning/5 p-5">
          <h2 className="text-lg font-medium">Story approval required</h2>
          <p className="mt-2 text-sm text-muted">
            Import and approve a five-scene screenplay in Story Studio before generation.
          </p>
          <Link
            href={`/projects/${project.id}/story`}
            className="mt-4 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
          >
            Open Story Studio
          </Link>
        </section>
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 p-5">
            <div>
              <h2 className="text-lg font-medium">Google Flow (manual)</h2>
              <p className="mt-1 text-sm text-muted">
                Prepare prompts, copy into normal Chrome, upload verified MP4s. Playwright Generate is
                disabled by default.
              </p>
            </div>
            <Link
              href={`/projects/${project.id}/flow-package`}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
            >
              Open Flow Generation Package
            </Link>
          </section>

          <LiveCanaryPanel projectId={project.id} liveConfigured={liveConfigured} />

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background-elevated/50 p-5">
            <div>
              <h2 className="text-lg font-medium">Mock generation controls</h2>
              <p className="mt-1 text-sm text-muted">
                {completedCount}/{BUSINESS_DEFAULTS.sceneCount} scenes complete · budget{' '}
                {credits.dailyBudget}/day · assets labeled MOCK
              </p>
              {snapshotError ? <p className="mt-2 text-sm text-danger">{snapshotError}</p> : null}
              {assemblyReady ? (
                <p className="mt-2 text-sm text-success">
                  All scenes ready —{' '}
                  <Link href={`/projects/${project.id}/assemble`} className="underline">
                    assemble final video
                  </Link>
                  .
                </p>
              ) : null}
            </div>
            {canStart ? (
              <form action={startMockGenerationAction.bind(null, project.id)}>
                <button
                  type="submit"
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
                >
                  {completedCount > 0 ? 'Resume mock generation' : 'Start mock generation'}
                </button>
              </form>
            ) : null}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-medium">Scenes</h2>
                <p className="text-sm text-muted">
                  Copy the full prompt → generate in normal Chrome Flow → upload the MP4 here.
                  Full package view:{' '}
                  <Link href={`/projects/${project.id}/flow-package`} className="text-accent underline">
                    Flow Generation Package
                  </Link>
                  .
                </p>
              </div>
            </div>
            {scenes.length === 0 ? (
              <p className="text-sm text-muted">
                Scenes materialize when generation starts from the approved screenplay.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {scenes
                  .slice()
                  .sort((a, b) => a.sceneNumber - b.sceneNumber)
                  .map((scene) => {
                    const canRetry =
                      scene.state === 'FAILED' ||
                      scene.state === 'NEEDS_ATTENTION' ||
                      scene.state === 'DOWNLOAD_FAILED' ||
                      scene.state === 'VERIFICATION_FAILED' ||
                      scene.state === 'UNKNOWN_SUBMISSION';
                    const realReady = isSceneReadyForAssembly(scene.state) && scene.assetOrigin === 'REAL_GENERATED';
                    return (
                      <li key={scene.id} className="space-y-4 px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="font-medium">
                              Scene {scene.sceneNumber}: {scene.title}
                            </p>
                            <p className="font-mono text-xs uppercase tracking-wide text-accent">
                              {scene.state}
                              {scene.assetOrigin ? ` · ${scene.assetOrigin}` : ''}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <CopyPromptButton text={scene.flowPrompt} />
                            {canRetry ? (
                              <form
                                action={retryFailedSceneAction.bind(
                                  null,
                                  project.id,
                                  scene.sceneNumber,
                                )}
                              >
                                <button
                                  type="submit"
                                  className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background"
                                >
                                  Retry scene {scene.sceneNumber} (mock)
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </div>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 font-mono text-xs text-muted">
                          {scene.flowPrompt}
                        </pre>
                        {scene.errorMessage ? (
                          <p className="text-sm text-danger">{scene.errorMessage}</p>
                        ) : null}
                        {realReady ? (
                          <p className="text-sm text-success">
                            Verified real asset stored
                            {scene.assetStorageKey ? ` · ${scene.assetStorageKey}` : ''}.
                          </p>
                        ) : (
                          <ManualSceneUpload
                            projectId={project.id}
                            sceneId={scene.id}
                            sceneNumber={scene.sceneNumber}
                          />
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function CreditStat({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-lg border border-border bg-background-elevated/80 px-4 py-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-mono text-3xl font-medium">{value}</p>
    </article>
  );
}
