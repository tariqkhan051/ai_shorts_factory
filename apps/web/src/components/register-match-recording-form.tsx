'use client';

import { useActionState } from 'react';
import {
  registerMatchRecordingAction,
  type MatchStudioActionState,
} from '@/app/match-studio/actions';

const initial: MatchStudioActionState = { ok: false };

export function RegisterMatchRecordingForm({ runId }: { runId: string }) {
  const bound = registerMatchRecordingAction.bind(null, runId);
  const [state, action, pending] = useActionState(bound, initial);

  return (
    <form action={action} className="space-y-3 rounded-md border border-border p-4">
      <h3 className="font-medium">Register local recording</h3>
      <p className="text-xs text-muted">
        Uses Match Studio ingest limits (long-form), not the Flow 1–20s import contract. Path must be
        readable by the server process (local absolute path for now).
      </p>
      <label className="block space-y-1 text-sm">
        <span>Local video path</span>
        <input
          name="local_path"
          required
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
          placeholder="D:\recordings\mlbb-match.mp4"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Original filename (optional)</span>
        <input
          name="original_filename"
          className="w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      {state.message ? (
        <p className={`text-sm ${state.ok ? 'text-green-700' : 'text-red-600'}`}>{state.message}</p>
      ) : null}
      {state.errors?.length ? (
        <ul className="list-disc pl-5 text-xs text-red-600">
          {state.errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? 'Validating…' : 'Validate & attach'}
      </button>
    </form>
  );
}
