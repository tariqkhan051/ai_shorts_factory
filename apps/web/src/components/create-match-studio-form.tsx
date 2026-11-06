'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import {
  createMatchStudioRunAction,
  type MatchStudioActionState,
} from '@/app/match-studio/actions';

const initial: MatchStudioActionState = { ok: false };

type ProfileOption = {
  id: string;
  name: string;
};

type PatchOption = {
  profileId: string;
  profileName: string;
  patchId: string;
  patchLabel: string;
  environment: string;
  status: 'published' | 'draft' | 'archived';
};

export function CreateMatchStudioForm({
  profiles: profilesProp,
  publishedPatches: publishedProp,
  draftPatches: draftProp,
}: {
  profiles?: ProfileOption[];
  publishedPatches?: PatchOption[];
  draftPatches?: PatchOption[];
}) {
  const profiles = profilesProp ?? [];
  const publishedPatches = publishedProp ?? [];
  const draftPatches = draftProp ?? [];
  const [state, action, pending] = useActionState(createMatchStudioRunAction, initial);
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '');
  const [environment, setEnvironment] = useState<'original' | 'advance'>('original');
  const [patchUnknown, setPatchUnknown] = useState(publishedPatches.length === 0);

  const filteredPublished = useMemo(
    () =>
      publishedPatches.filter(
        (p) => p.environment === environment && (!profileId || p.profileId === profileId),
      ),
    [publishedPatches, environment, profileId],
  );

  const filteredDrafts = useMemo(
    () =>
      draftPatches.filter(
        (p) => p.environment === environment && (!profileId || p.profileId === profileId),
      ),
    [draftPatches, environment, profileId],
  );

  const selectedPatchId = filteredPublished[0]?.patchId ?? '';
  const canSubmit =
    !pending &&
    profiles.length > 0 &&
    Boolean(profileId) &&
    (patchUnknown || filteredPublished.length > 0);

  return (
    <form action={action} className="max-w-xl space-y-4 rounded-md border border-border p-4">
      {profiles.length === 0 ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
          No game profiles yet. Run Autonomous Knowledge Engine ingest or import at{' '}
          <Link href="/game-knowledge" className="text-accent underline">
            /game-knowledge
          </Link>{' '}
          first.
        </p>
      ) : null}

      {publishedPatches.length === 0 && profiles.length > 0 ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
          No <strong>published</strong> patches yet
          {draftPatches.length > 0 ? ` (${draftPatches.length} draft${draftPatches.length === 1 ? '' : 's'} available)` : ''}
          . Publish a draft at{' '}
          <Link href="/game-knowledge" className="text-accent underline">
            /game-knowledge
          </Link>{' '}
          for KB-backed commentary, or create this run with <strong>Patch unknown</strong>.
        </p>
      ) : null}

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
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          disabled={profiles.length === 0}
        >
          {profiles.length === 0 ? <option value="">No profiles</option> : null}
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
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
          value="on"
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
            key={`${environment}-${profileId}-${selectedPatchId}`}
            defaultValue={selectedPatchId}
            disabled={filteredPublished.length === 0}
          >
            {filteredPublished.length === 0 ? (
              <option value="">No published patches for this environment</option>
            ) : (
              filteredPublished.map((p) => (
                <option key={p.patchId} value={p.patchId}>
                  {p.patchLabel}
                </option>
              ))
            )}
          </select>
          {filteredPublished.length === 0 ? (
            <span className="text-xs text-muted">
              Switch environment, publish a draft, or enable Patch unknown.
            </span>
          ) : null}
        </label>
      ) : null}

      {filteredDrafts.length > 0 ? (
        <div className="rounded-md border border-border bg-background-elevated px-3 py-2 text-xs text-muted">
          <p className="font-medium text-foreground">Draft patches (not selectable until published)</p>
          <ul className="mt-1 list-disc pl-4">
            {filteredDrafts.slice(0, 8).map((draft) => (
              <li key={draft.patchId} className="font-mono">
                {draft.patchLabel}
              </li>
            ))}
          </ul>
        </div>
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
        disabled={!canSubmit}
        className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create Match Studio run'}
      </button>
    </form>
  );
}
