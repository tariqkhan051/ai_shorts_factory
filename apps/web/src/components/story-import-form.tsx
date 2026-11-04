'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { importScreenplayAction, type StoryActionState } from '@/app/projects/[id]/story/actions';

const initialState: StoryActionState = { ok: false };

export function StoryImportForm({ projectId }: { projectId: string }) {
  const action = importScreenplayAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1.5" htmlFor="json">
        <span className="text-sm text-muted">Paste ChatGPT JSON</span>
        <textarea
          id="json"
          name="json"
          required
          rows={14}
          className="field-input font-mono text-xs"
          placeholder='{"schema_version":"1.0.0","title":"...","scenes":[...]}'
        />
      </label>

      {(state.message || state.errors?.length || state.warnings?.length) && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            state.ok ? 'border-success/40 text-success' : 'border-danger/40 text-danger'
          }`}
        >
          <p>{state.message}</p>
          {state.errors?.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-danger">
              {state.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          {state.warnings?.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-warning">
              {state.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {state.ok && state.nextHref ? (
            <p className="mt-3">
              <Link
                href={state.nextHref}
                className="inline-flex rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-background hover:bg-accent/90"
              >
                Review characters →
              </Link>
            </p>
          ) : null}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90 disabled:opacity-60"
      >
        {pending ? 'Importing…' : 'Import & validate'}
      </button>
    </form>
  );
}
