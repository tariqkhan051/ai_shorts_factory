'use client';

import { CopyPromptButton } from '@/components/copy-prompt-button';
import { ManualSceneUpload } from '@/components/manual-scene-upload';
import { markAwaitingManualGenerationAction } from '@/app/projects/[id]/flow-package/actions';
import {
  isSceneReadyForAssembly,
  type FlowSceneGenerationTask,
} from '@ai-shorts-factory/flow-adapter';

type Props = {
  projectId: string;
  task: FlowSceneGenerationTask;
};

export function FlowPackageSceneCard({ projectId, task }: Props) {
  const ready = isSceneReadyForAssembly(task.completionStatus);
  const canMarkAwaiting =
    task.completionStatus === 'PROMPT_READY' || task.completionStatus === 'PENDING';
  const canUpload = !ready && task.completionStatus !== 'UPLOADED_PENDING_VERIFICATION';

  return (
    <article className="space-y-4 border-b border-border px-4 py-5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-lg font-medium">
            Scene {task.sceneNumber}: {task.title}
          </h3>
          <p className="font-mono text-xs uppercase tracking-wide text-accent">
            {task.completionStatus}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyPromptButton text={task.flowPrompt} />
          {canMarkAwaiting && task.sceneId ? (
            <form action={markAwaitingManualGenerationAction.bind(null, projectId, task.sceneId)}>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background"
              >
                Mark awaiting generation
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 font-mono text-xs text-muted">
        {task.flowPrompt}
      </pre>

      <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Model</dt>
          <dd className="font-mono">{task.model}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Aspect</dt>
          <dd className="font-mono">{task.aspectRatio}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Duration / res</dt>
          <dd className="font-mono">
            {task.durationSeconds}s · {task.resolution}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Est. credits</dt>
          <dd className="font-mono">{String(task.estimatedCreditCost)}</dd>
        </div>
      </dl>

      <div>
        <h4 className="text-sm font-medium">Character references (Flow Ingredients)</h4>
        <ul className="mt-2 space-y-2">
          {task.characterReferences.map((ref) => (
            <li key={ref.name} className="rounded-md border border-border/70 px-3 py-2 text-sm">
              <p className="font-medium">{ref.name}</p>
              <p className="text-muted">{ref.visualIdentity}</p>
              {ref.flowLibraryHint ? (
                <p className="mt-1 font-mono text-xs text-accent">
                  Select in Flow library: {ref.flowLibraryHint}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {ready ? (
        <p className="text-sm text-success">Verified real asset ready for assembly.</p>
      ) : task.sceneId && canUpload ? (
        <ManualSceneUpload
          projectId={projectId}
          sceneId={task.sceneId}
          sceneNumber={task.sceneNumber}
        />
      ) : (
        <p className="text-sm text-muted">Upload locked while verification is running.</p>
      )}
    </article>
  );
}
