'use client';

import { useEffect, useState, useTransition } from 'react';
import { CopyPromptButton } from '@/components/copy-prompt-button';
import { ManualSceneUpload } from '@/components/manual-scene-upload';
import {
  markAwaitingManualGenerationAction,
  updateSceneFlowPromptAction,
} from '@/app/projects/[id]/flow-package/actions';
import {
  isSceneReadyForAssembly,
  type FlowSceneGenerationTask,
} from '@ai-shorts-factory/flow-adapter/manual';

type Props = {
  projectId: string;
  task: FlowSceneGenerationTask;
};

function combinePrompt(flowPrompt: string, continuityPrompt: string | undefined): string {
  const continuity = continuityPrompt?.trim() ?? '';
  if (!continuity) return flowPrompt;
  return `${flowPrompt.trim()}\n\n--- Character continuity (operator Ingredients) ---\n${continuity}`;
}

export function FlowPackageSceneCard({ projectId, task }: Props) {
  const ready = isSceneReadyForAssembly(task.completionStatus);
  const canMarkAwaiting =
    task.completionStatus === 'PROMPT_READY' || task.completionStatus === 'PENDING';
  const canUpload = !ready && task.completionStatus !== 'UPLOADED_PENDING_VERIFICATION';
  const missingRefs = task.characterReferences.filter((ref) => ref.missingReference);

  const [draftPrompt, setDraftPrompt] = useState(task.flowPrompt);
  const [pending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setDraftPrompt(task.flowPrompt);
  }, [task.flowPrompt, task.sceneId]);

  const dirty = draftPrompt.trim() !== task.flowPrompt.trim();
  const combinedDraft = combinePrompt(draftPrompt, task.continuityPrompt);

  function savePrompt() {
    if (!task.sceneId || pending) return;
    setSaveError(null);
    setSavedFlash(false);
    const formData = new FormData();
    formData.set('projectId', projectId);
    formData.set('sceneId', task.sceneId);
    formData.set('flowPrompt', draftPrompt);
    startTransition(async () => {
      try {
        await updateSceneFlowPromptAction(formData);
        setSavedFlash(true);
        window.setTimeout(() => setSavedFlash(false), 1800);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Failed to save prompt');
      }
    });
  }

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
          <CopyPromptButton text={draftPrompt} label="Copy scene prompt" />
          {task.continuityPrompt ? (
            <CopyPromptButton text={task.continuityPrompt} label="Copy continuity" />
          ) : null}
          {task.continuityPrompt || task.combinedPrompt ? (
            <CopyPromptButton text={combinedDraft} label="Copy combined prompt" />
          ) : null}
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

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`flow-prompt-${task.sceneId ?? task.sceneNumber}`} className="text-sm font-medium">
            Scene prompt
          </label>
          {task.sceneId ? (
            <div className="flex flex-wrap items-center gap-2">
              {dirty ? (
                <button
                  type="button"
                  onClick={() => setDraftPrompt(task.flowPrompt)}
                  disabled={pending}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background disabled:opacity-50"
                >
                  Reset
                </button>
              ) : null}
              <button
                type="button"
                onClick={savePrompt}
                disabled={pending || !dirty || !draftPrompt.trim()}
                className="rounded-md bg-accent px-3 py-1.5 text-sm text-background disabled:opacity-50"
              >
                {pending ? 'Saving…' : savedFlash ? 'Saved' : 'Save prompt'}
              </button>
            </div>
          ) : null}
        </div>
        <textarea
          id={`flow-prompt-${task.sceneId ?? task.sceneNumber}`}
          value={draftPrompt}
          onChange={(event) => {
            setDraftPrompt(event.target.value);
            setSaveError(null);
            setSavedFlash(false);
          }}
          rows={8}
          className="field-input max-h-64 min-h-32 w-full resize-y font-mono text-xs"
          spellCheck={false}
        />
        <p className="text-xs text-muted">
          Edit here when Flow rejects a prompt, then copy again. Saving updates this package scene
          and the project screenplay together, without resetting story approval.
        </p>
        {saveError ? <p className="text-sm text-danger">{saveError}</p> : null}
      </div>

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
        <h4 className="text-sm font-medium">Characters in this scene (Flow Ingredients)</h4>
        {missingRefs.length > 0 ? (
          <p className="mt-1 text-sm text-danger">
            Missing primary reference image for: {missingRefs.map((ref) => ref.name).join(', ')}
          </p>
        ) : null}
        <ul className="mt-2 space-y-3">
          {task.characterReferences.map((ref) => (
            <li key={ref.name} className="rounded-md border border-border/70 px-3 py-3 text-sm">
              <div className="flex flex-wrap gap-3">
                {ref.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ref.previewUrl}
                    alt={`${ref.name} reference`}
                    className="h-24 w-24 rounded object-cover bg-background"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded border border-dashed border-border text-xs text-muted">
                    No image
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{ref.name}</p>
                  <p className="text-muted">{ref.visualIdentity}</p>
                  {ref.continuityRules ? (
                    <p className="mt-1 text-xs text-muted">Continuity: {ref.continuityRules}</p>
                  ) : null}
                  {ref.flowLibraryHint ? (
                    <p className="mt-1 font-mono text-xs text-accent">
                      Select in Flow library: {ref.flowLibraryHint}
                    </p>
                  ) : null}
                  {ref.additionalPreviewUrls && ref.additionalPreviewUrls.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ref.additionalPreviewUrls.map((url) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={url}
                          alt={`${ref.name} additional reference`}
                          src={url}
                          className="h-12 w-12 rounded object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {task.verificationFailureReason ? (
        <p className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
          Verification failed: {task.verificationFailureReason}
        </p>
      ) : null}

      {ready ? (
        <div className="space-y-3">
          <p className="text-sm text-success">Verified real asset ready for assembly.</p>
          {task.assetPreviewUrl ? (
            <video
              src={task.assetPreviewUrl}
              controls
              className="max-h-80 w-full rounded-md border border-border bg-black"
            />
          ) : null}
        </div>
      ) : task.sceneId && canUpload ? (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Upload MP4</h4>
          <ManualSceneUpload
            projectId={projectId}
            sceneId={task.sceneId}
            sceneNumber={task.sceneNumber}
          />
        </div>
      ) : (
        <p className="text-sm text-muted">Upload locked while verification is running.</p>
      )}
    </article>
  );
}
