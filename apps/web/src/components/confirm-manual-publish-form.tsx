'use client';

import { useActionState } from 'react';
import {
  confirmManualPublishAction,
  type DistributionActionState,
} from '@/app/projects/[id]/videos/[videoId]/distribution/actions';

const initial: DistributionActionState = { ok: false };

export function ConfirmManualPublishForm({
  projectId,
  videoId,
  distributionId,
}: {
  projectId: string;
  videoId: string;
  distributionId: string;
}) {
  const [state, action, pending] = useActionState(
    confirmManualPublishAction.bind(null, projectId, videoId, distributionId),
    initial,
  );

  return (
    <form action={action} className="space-y-2 border-t border-border pt-3">
      <p className="text-xs text-muted">Confirm after you publish manually outside the app.</p>
      {state.message ? (
        <p className={`text-xs ${state.ok ? 'text-accent' : 'text-danger'}`}>{state.message}</p>
      ) : null}
      <input
        name="published_url"
        type="url"
        placeholder="https://…"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      <input
        name="platform_reference_id"
        placeholder="Platform reference ID (optional)"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-background disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Mark manually published'}
      </button>
    </form>
  );
}
