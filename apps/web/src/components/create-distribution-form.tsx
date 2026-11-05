'use client';

import { useActionState } from 'react';
import {
  createDistributionAction,
  type DistributionActionState,
} from '@/app/projects/[id]/videos/[videoId]/distribution/actions';

const initial: DistributionActionState = { ok: false };

export function CreateDistributionForm({
  projectId,
  videoId,
  accounts,
}: {
  projectId: string;
  videoId: string;
  accounts: Array<{ id: string; display_name: string; platform: string; handle: string }>;
}) {
  const [state, action, pending] = useActionState(
    createDistributionAction.bind(null, projectId, videoId),
    initial,
  );

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted">
        Register a social account first, then add a distribution destination.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-background-elevated/50 p-5">
      <h2 className="text-lg font-medium">Add destination</h2>
      {state.message ? (
        <p className={`text-sm ${state.ok ? 'text-accent' : 'text-danger'}`}>{state.message}</p>
      ) : null}
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Account</span>
        <select name="social_account_id" required className="w-full rounded-md border border-border bg-background px-3 py-2">
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.platform} — {account.display_name} ({account.handle})
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Caption</span>
        <textarea name="caption" rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Hashtags (space or comma separated)</span>
        <input name="hashtags" className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Target format</span>
        <input name="target_format" defaultValue="9:16" className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Add destination'}
      </button>
    </form>
  );
}
