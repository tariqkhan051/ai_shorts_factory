'use client';

import { useActionState } from 'react';
import { createCharacterAction, type StoryActionState } from '@/app/projects/[id]/story/actions';

const initialState: StoryActionState = { ok: false };

export function CharacterForm({ projectId }: { projectId: string }) {
  const action = createCharacterAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <input name="name" required placeholder="Name" className="field-input" />
      <input
        name="visual_identity"
        required
        placeholder="Visual identity"
        className="field-input"
      />
      <input
        name="description"
        required
        placeholder="Description"
        className="field-input sm:col-span-2"
      />
      <input name="clothing" placeholder="Clothing" className="field-input" />
      <input name="appearance_details" placeholder="Appearance details" className="field-input" />
      {state.message ? (
        <p className={`sm:col-span-2 text-sm ${state.ok ? 'text-success' : 'text-danger'}`}>
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background-elevated disabled:opacity-60 sm:col-span-2"
      >
        {pending ? 'Saving…' : 'Add character'}
      </button>
    </form>
  );
}
