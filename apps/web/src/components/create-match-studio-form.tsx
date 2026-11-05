'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  createMatchStudioRunAction,
  type MatchStudioActionState,
} from '@/app/match-studio/actions';

const initial: MatchStudioActionState = { ok: false };

type PatchOption = {
  profileId: string;
  profileName: string;
  patchId: string;
  patchLabel: string;
  environment: string;
};

export function CreateMatchStudioForm({ patchOptions }: { patchOptions: PatchOption[] }) {
  const [state, action, pending] = useActionState(createMatchStudioRunAction, initial);
  const [environment, setEnvironment] = useState<'original' | 'advance'>('original');
  const [patchUnknown, setPatchUnknown] = useState(false);

  const profiles = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of patchOptions) map.set(opt.profileId, opt.profileName);
    return [...map.entries()];
  }, [patchOptions]);

  const filteredPatches = patchOptions.filter((p) => p.environment === environment);

  return (
    <form action={action} className="max-w-xl space-y-4 rounded-md border border-border p-4">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Title</span>
        <input
          name="title"
          required
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          placeholder="Ranked match — Nov 5"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Game profile</span>
        <select
          name="game_profile_id"
          required
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          defaultValue={profiles[0]?.[0] ?? ''}
        >
          {profiles.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Server environment</span>
        <select
          name="server_environment"
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          value={environment}
          onChange={(e) => setEnvironment(e.target.value as 'original' | 'advance')}
        >
          <option value="original">Original Server</option>
          <option value="advance">Advance Server</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="patch_unknown"
          checked={patchUnknown}
          onChange={(e) => setPatchUnknown(e.target.checked)}
        />
        Patch unknown (limits KB-backed commentary until bound)
      </label>

      {!patchUnknown ? (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Published patch</span>
          <select
            name="game_patch_id"
            required={!patchUnknown}
            className="w-full rounded-md border border-border bg-background px-3 py-2"
            defaultValue={filteredPatches[0]?.patchId ?? ''}
          >
            {filteredPatches.map((p) => (
              <option key={p.patchId} value={p.patchId}>
                {p.patchLabel}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Notes</span>
        <textarea
          name="notes"
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>

      {state.message && !state.ok ? (
        <p className="text-sm text-red-600">{state.message}</p>
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
        disabled={pending || (profiles.length === 0 && !patchUnknown)}
        className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create Match Studio run'}
      </button>
    </form>
  );
}
