'use client';

import { useActionState, useMemo, useState } from 'react';
import type { ScreenplayV1 } from '@ai-shorts-factory/validation';
import {
  saveScreenplayEditsAction,
  type StoryActionState,
} from '@/app/projects/[id]/story/actions';

const initialState: StoryActionState = { ok: false };

export function ScreenplayEditor({
  projectId,
  screenplay,
}: {
  projectId: string;
  screenplay: ScreenplayV1;
}) {
  const [draft, setDraft] = useState(screenplay);
  const action = saveScreenplayEditsAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const json = useMemo(() => JSON.stringify(draft, null, 2), [draft]);

  function updateScene(index: number, patch: Partial<ScreenplayV1['scenes'][number]>) {
    setDraft((current) => ({
      ...current,
      scenes: current.scenes.map((scene, i) => (i === index ? { ...scene, ...patch } : scene)),
    }));
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">Title</span>
          <input
            className="field-input"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">Hook</span>
          <input
            className="field-input"
            value={draft.hook}
            onChange={(e) => setDraft({ ...draft, hook: e.target.value })}
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm text-muted">Story summary</span>
        <textarea
          className="field-input"
          rows={3}
          value={draft.story_summary}
          onChange={(e) => setDraft({ ...draft, story_summary: e.target.value })}
        />
      </label>

      <div className="space-y-4">
        {draft.scenes.map((scene, index) => (
          <article
            key={scene.scene_number}
            className="rounded-lg border border-border bg-background/40 p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-medium">
                Scene {scene.scene_number}: {scene.title || 'Untitled'}
              </h3>
              <input
                className="field-input w-28"
                type="number"
                min={1}
                step={0.1}
                value={scene.duration_seconds}
                onChange={(e) =>
                  updateScene(index, { duration_seconds: Number(e.target.value) || 1 })
                }
              />
            </div>
            <div className="grid gap-3">
              <input
                className="field-input"
                value={scene.title}
                onChange={(e) => updateScene(index, { title: e.target.value })}
                placeholder="Scene title"
              />
              <textarea
                className="field-input"
                rows={2}
                value={scene.visual_description}
                onChange={(e) => updateScene(index, { visual_description: e.target.value })}
                placeholder="Visual description"
              />
              <textarea
                className="field-input"
                rows={2}
                value={scene.flow_prompt}
                onChange={(e) => updateScene(index, { flow_prompt: e.target.value })}
                placeholder="Flow prompt"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <textarea
                  className="field-input"
                  rows={2}
                  value={scene.narration}
                  onChange={(e) => updateScene(index, { narration: e.target.value })}
                  placeholder="Narration"
                />
                <textarea
                  className="field-input"
                  rows={2}
                  value={scene.dialogue}
                  onChange={(e) => updateScene(index, { dialogue: e.target.value })}
                  placeholder="Dialogue"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className="field-input"
                  value={scene.text_overlay}
                  onChange={(e) => updateScene(index, { text_overlay: e.target.value })}
                  placeholder="On-screen caption / text overlay"
                />
                <input
                  className="field-input"
                  value={scene.transition_out}
                  onChange={(e) => updateScene(index, { transition_out: e.target.value })}
                  placeholder="Transition out"
                />
              </div>
            </div>
          </article>
        ))}
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="screenplay_json" value={json} readOnly />
        {(state.message || state.errors?.length) && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              state.ok ? 'border-success/40 text-success' : 'border-danger/40 text-danger'
            }`}
          >
            <p>{state.message}</p>
            {state.errors?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {state.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save screenplay edits'}
        </button>
      </form>
    </div>
  );
}
