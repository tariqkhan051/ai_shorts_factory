'use client';

import { useActionState } from 'react';
import {
  createEnvironmentAction,
  type EnvironmentActionState,
} from '@/app/projects/[id]/environments/actions';

const initial: EnvironmentActionState = { ok: false };

export function CreateEnvironmentForm({
  projectId,
  kinds,
}: {
  projectId: string;
  kinds: string[];
}) {
  const [state, action, pending] = useActionState(
    createEnvironmentAction.bind(null, projectId),
    initial,
  );

  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-background-elevated/50 p-5">
      <h2 className="text-lg font-medium">Add environment</h2>
      {state.message ? (
        <p className={`text-sm ${state.ok ? 'text-accent' : 'text-danger'}`}>{state.message}</p>
      ) : null}
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Name</span>
        <input name="name" required className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Kind</span>
        <select name="kind" className="w-full rounded-md border border-border bg-background px-3 py-2" defaultValue="location">
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Description</span>
        <textarea name="description" rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Visual identity</span>
        <textarea name="visual_identity" rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Continuity rules</span>
        <textarea name="continuity_rules" rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Add to library'}
      </button>
    </form>
  );
}
