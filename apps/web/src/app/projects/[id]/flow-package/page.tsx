import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isSceneReadyForAssembly } from '@ai-shorts-factory/flow-adapter';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import { prepareFlowPackageAction } from '@/app/projects/[id]/flow-package/actions';
import { FlowPackageSceneCard } from '@/components/flow-package-scene-card';
import { requireUser } from '@/lib/auth';
import {
  buildProjectFlowGenerationPackage,
  projectCreditSummary,
} from '@/lib/generation/flow-package';
import { prepareScenesPromptReady } from '@/lib/generation/manual-import';
import { getCreditLedger } from '@/lib/generation/runtime';
import {
  getCharacterRepository,
  getProjectRepository,
  getStoryRepository,
} from '@/lib/projects/repository';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function FlowPackagePage({ params }: PageProps) {
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

  let pkg = null as ReturnType<typeof buildProjectFlowGenerationPackage> | null;
  let error: string | null = null;

  if (approved && story?.current_version?.screenplay) {
    try {
      const scenes = await prepareScenesPromptReady(user.id, id);
      const characterRows = await characters.listByProject(user.id, id);
      pkg = buildProjectFlowGenerationPackage({
        projectId: id,
        projectName: project.name,
        screenplay: story.current_version.screenplay,
        scenes,
        characters: characterRows,
      });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unable to build Flow package';
    }
  }

  const readyCount = pkg?.scenes.filter((scene) => isSceneReadyForAssembly(scene.completionStatus)).length ?? 0;
  const creditSummary = pkg
    ? projectCreditSummary(
        pkg.scenes.map((scene) => ({
          id: scene.sceneId ?? String(scene.sceneNumber),
          projectId: id,
          sceneNumber: scene.sceneNumber,
          title: scene.title,
          state: scene.completionStatus,
          durationSeconds: scene.durationSeconds,
          flowPrompt: scene.flowPrompt,
          confirmedCreditCost: scene.confirmedCreditCost,
          createdAt: pkg!.createdAt,
          updatedAt: pkg!.createdAt,
        })),
        pkg.estimatedCostPerScene,
      )
    : null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href={`/projects/${project.id}/generate`} className="text-sm text-muted hover:text-foreground">
          ← Scene generation
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Flow Generation Package</h1>
        <p className="max-w-3xl text-muted">
          Human-in-the-loop Google Flow workflow. Open normal Chrome yourself, paste prompts,
          generate manually, then upload MP4s here. Copying a prompt never marks a scene generated.
        </p>
        <p className="font-mono text-xs uppercase tracking-wide text-accent">
          {project.workflow_state} · {readyCount}/{BUSINESS_DEFAULTS.sceneCount} verified
        </p>
      </div>

      {!approved ? (
        <section className="rounded-lg border border-warning/40 bg-warning/5 p-5">
          <h2 className="text-lg font-medium">Story approval required</h2>
          <p className="mt-2 text-sm text-muted">
            Approve a five-scene screenplay before preparing Flow prompts.
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
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Estimated project" value={String(creditSummary?.estimatedProjectCost ?? '—')} />
            <Stat
              label="Confirmed (manual)"
              value={
                creditSummary?.confirmedProjectCost === undefined
                  ? '—'
                  : String(creditSummary.confirmedProjectCost)
              }
            />
            <Stat label="Ledger unknown" value={String(credits.unknownConsumption)} />
            <Stat label="Spendable" value={String(credits.spendable)} />
          </section>

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background-elevated/50 p-5">
            <div>
              <h2 className="text-lg font-medium">Operator controls</h2>
              <p className="mt-1 text-sm text-muted">
                Model {pkg?.model ?? BUSINESS_DEFAULTS.defaultGenerationModel} ·{' '}
                {pkg?.aspectRatio ?? BUSINESS_DEFAULTS.defaultGenerationAspectRatio} ·{' '}
                {pkg?.durationSeconds ?? BUSINESS_DEFAULTS.defaultGenerationDurationSeconds}s ·{' '}
                {pkg?.resolution ?? BUSINESS_DEFAULTS.defaultGenerationResolution}
              </p>
              {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={prepareFlowPackageAction.bind(null, project.id)}>
                <button
                  type="submit"
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-background"
                >
                  Refresh package
                </button>
              </form>
              <a
                href={`/api/projects/${project.id}/flow-package/manifest`}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
              >
                Download JSON manifest
              </a>
              {readyCount === BUSINESS_DEFAULTS.sceneCount ? (
                <Link
                  href={`/projects/${project.id}/assemble`}
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-background"
                >
                  Assemble final video
                </Link>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-border">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-lg font-medium">Scenes</h2>
              <p className="text-sm text-muted">
                Follow package instructions in normal Chrome. No Playwright Generate.
              </p>
            </div>
            {pkg ? (
              pkg.scenes.map((task) => (
                <FlowPackageSceneCard key={task.sceneNumber} projectId={project.id} task={task} />
              ))
            ) : (
              <p className="px-4 py-5 text-sm text-muted">Package not available.</p>
            )}
          </section>

          {pkg ? (
            <section className="rounded-lg border border-border bg-background-elevated/40 p-5">
              <h2 className="text-lg font-medium">Generation instructions</h2>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
                {pkg.scenes[0]?.instructions.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-border bg-background-elevated/80 px-4 py-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-mono text-2xl font-medium">{value}</p>
    </article>
  );
}
