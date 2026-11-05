'use client';

import { useActionState } from 'react';
import {
  createVideoAction,
  type VideoActionState,
} from '@/app/projects/[id]/videos/actions';

const initial: VideoActionState = { ok: false };

export function CreateVideoForm({
  projectId,
  disabled,
}: {
  projectId: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(
    createVideoAction.bind(null, projectId),
    initial,
  );

  return (
    <form action={action} className="space-y-4 rounded-lg border border-border bg-background-elevated/50 p-5">
      {state.message ? (
        <p className={`text-sm ${state.ok ? 'text-accent' : 'text-danger'}`}>{state.message}</p>
      ) : null}
      {state.errors?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-danger">
          {state.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      <label className="block space-y-1 text-sm">
        <span className="text-muted">Title (optional)</span>
        <input
          name="title"
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          placeholder="The Fallen Warrior"
          disabled={disabled}
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-muted">Video idea / concept</span>
        <textarea
          name="concept"
          required
          rows={4}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          placeholder="A warrior discovers the truth about his closest ally"
          disabled={disabled}
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-muted">Story brief (optional)</span>
        <textarea
          name="story_brief"
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          disabled={disabled}
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-muted">Special instructions (optional)</span>
        <textarea
          name="special_instructions"
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          disabled={disabled}
        />
      </label>

      <button
        type="submit"
        disabled={pending || disabled}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90 disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create video'}
      </button>
    </form>
  );
}
