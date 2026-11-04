'use client';

import { useActionState } from 'react';
import { CONTENT_CATEGORIES, VISUAL_STYLES } from '@ai-shorts-factory/shared-types';
import type { ProjectRecord } from '@ai-shorts-factory/database';
import {
  createProjectAction,
  updateProjectAction,
  type ActionState,
} from '@/app/projects/actions';

const initialState: ActionState = { ok: false };

const categoryLabels: Record<(typeof CONTENT_CATEGORIES)[number], string> = {
  fictional_story: 'Fictional story',
  cinematic: 'Cinematic',
  anime: 'Anime',
  educational: 'Educational',
  documentary: 'Documentary',
  kids_cartoon: 'Kids / cartoon',
  gaming: 'Gaming',
  romantic_emotional: 'Romantic / emotional',
  other: 'Other',
};

const styleLabels: Record<(typeof VISUAL_STYLES)[number], string> = {
  automatic: 'Automatic',
  realistic_cinematic: 'Realistic cinematic',
  anime: 'Anime',
  '2d_animation': '2D animation',
  '3d_cartoon': '3D cartoon',
  documentary: 'Documentary',
  educational_motion_graphics: 'Educational motion graphics',
  custom: 'Custom',
};

type ProjectFormProps =
  | { mode: 'create' }
  | { mode: 'edit'; project: ProjectRecord };

export function ProjectForm(props: ProjectFormProps) {
  const boundUpdate =
    props.mode === 'edit'
      ? updateProjectAction.bind(null, props.project.id)
      : createProjectAction;

  const [state, formAction, pending] = useActionState(boundUpdate, initialState);
  const project = props.mode === 'edit' ? props.project : null;

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name" htmlFor="name">
          <input
            id="name"
            name="name"
            required
            defaultValue={project?.name ?? ''}
            className="field-input"
            placeholder="Neon Courier"
          />
        </Field>
        <Field label="Language" htmlFor="language">
          <input
            id="language"
            name="language"
            defaultValue={project?.language ?? 'en'}
            className="field-input"
          />
        </Field>
        <Field label="Content category" htmlFor="category">
          <select
            id="category"
            name="category"
            required
            defaultValue={project?.category ?? 'cinematic'}
            className="field-input"
          >
            {CONTENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {categoryLabels[category]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Visual style" htmlFor="visual_style">
          <select
            id="visual_style"
            name="visual_style"
            defaultValue={project?.visual_style ?? 'automatic'}
            className="field-input"
          >
            {VISUAL_STYLES.map((style) => (
              <option key={style} value={style}>
                {styleLabels[style]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Target audience" htmlFor="target_audience">
        <input
          id="target_audience"
          name="target_audience"
          defaultValue={project?.target_audience ?? ''}
          className="field-input"
          placeholder="Teens, adults, parents…"
        />
      </Field>

      <Field label="Idea / general story" htmlFor="idea">
        <textarea
          id="idea"
          name="idea"
          required
          rows={5}
          defaultValue={project?.input?.idea ?? ''}
          className="field-input"
          placeholder="Describe the short you want to produce."
        />
      </Field>

      <Field label="Optional existing story" htmlFor="existing_story">
        <textarea
          id="existing_story"
          name="existing_story"
          rows={4}
          defaultValue={project?.input?.existing_story ?? ''}
          className="field-input"
        />
      </Field>

      <Field label="Character reference notes" htmlFor="character_reference_notes">
        <textarea
          id="character_reference_notes"
          name="character_reference_notes"
          rows={3}
          defaultValue={project?.input?.character_reference_notes ?? ''}
          className="field-input"
        />
      </Field>

      <Field label="Additional creative instructions" htmlFor="additional_instructions">
        <textarea
          id="additional_instructions"
          name="additional_instructions"
          rows={3}
          defaultValue={project?.input?.additional_instructions ?? ''}
          className="field-input"
        />
      </Field>

      <Field label="Internal notes" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={project?.notes ?? ''}
          className="field-input"
        />
      </Field>

      {(state.message || state.errors?.length) && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            state.ok
              ? 'border-success/40 text-success'
              : 'border-danger/40 text-danger'
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
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background transition hover:bg-accent/90 disabled:opacity-60"
      >
        {pending
          ? 'Saving…'
          : props.mode === 'create'
            ? 'Create project'
            : 'Save changes'}
      </button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5" htmlFor={htmlFor}>
      <span className="text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}
