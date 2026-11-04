'use client';

import { useActionState } from 'react';
import type { CharacterRecord, ReferenceAssetRecord } from '@ai-shorts-factory/database';
import { CharacterReferenceUpload } from '@/components/character-reference-upload';
import {
  removeCharacterReferenceAction,
  removeProjectCharacterAction,
  saveCharacterToLibraryAction,
  setPrimaryReferenceAction,
  updateCharacterAction,
  type CharacterActionState,
} from '@/app/projects/[id]/characters/actions';

const initialState: CharacterActionState = { ok: false };

export function CharacterReviewCard({
  projectId,
  character,
  sceneNumbers,
  references,
}: {
  projectId: string;
  character: CharacterRecord;
  sceneNumbers: number[];
  references: ReferenceAssetRecord[];
}) {
  const update = updateCharacterAction.bind(null, projectId, character.id);
  const [state, formAction, pending] = useActionState(update, initialState);
  const referenceReady = Boolean(character.primary_reference_asset_id);

  return (
    <article className="space-y-4 rounded-lg border border-border bg-background-elevated/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium">{character.name}</h3>
          <p className="font-mono text-xs text-muted">
            id: {character.screenplay_character_id ?? '—'} ·{' '}
            {referenceReady ? (
              <span className="text-success">reference-ready</span>
            ) : (
              <span className="text-danger">missing primary reference</span>
            )}
            {character.in_library ? ' · library' : ''}
          </p>
          <p className="mt-1 text-sm text-muted">
            Scenes: {sceneNumbers.length ? sceneNumbers.join(', ') : 'none linked'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!character.in_library ? (
            <form action={saveCharacterToLibraryAction.bind(null, projectId, character.id)}>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background"
              >
                Save to library
              </button>
            </form>
          ) : null}
          <form action={removeProjectCharacterAction.bind(null, projectId, character.id)}>
            <button type="submit" className="rounded-md px-3 py-1.5 text-sm text-danger hover:underline">
              Remove from project
            </button>
          </form>
        </div>
      </div>

      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <input name="name" defaultValue={character.name} required className="field-input" />
        <input name="role" defaultValue={character.role} placeholder="Role" className="field-input" />
        <input
          name="age_range"
          defaultValue={character.age_range}
          placeholder="Age range"
          className="field-input"
        />
        <input
          name="visual_identity"
          defaultValue={character.visual_identity}
          required
          className="field-input"
        />
        <textarea
          name="description"
          defaultValue={character.description}
          required
          rows={2}
          className="field-input sm:col-span-2"
        />
        <input
          name="clothing"
          defaultValue={character.clothing}
          placeholder="Clothing"
          className="field-input"
        />
        <input
          name="appearance_details"
          defaultValue={character.appearance_details}
          placeholder="Appearance details"
          className="field-input"
        />
        <textarea
          name="continuity_rules"
          defaultValue={character.continuity_rules}
          placeholder="Continuity rules"
          rows={2}
          className="field-input sm:col-span-2"
        />
        <textarea
          name="reference_image_prompt"
          defaultValue={character.reference_image_prompt}
          placeholder="Reference image prompt (text only — not an image)"
          rows={2}
          className="field-input sm:col-span-2"
        />
        <input
          name="voice_description"
          defaultValue={character.voice_description}
          placeholder="Voice description"
          className="field-input"
        />
        <input
          name="dialogue_style"
          defaultValue={character.dialogue_style}
          placeholder="Dialogue style"
          className="field-input"
        />
        {state.message ? (
          <p className={`sm:col-span-2 text-sm ${state.ok ? 'text-success' : 'text-danger'}`}>
            {state.message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background disabled:opacity-60 sm:col-span-2"
        >
          {pending ? 'Saving…' : 'Save character'}
        </button>
      </form>

      <div className="space-y-3 border-t border-border pt-4">
        <h4 className="text-sm font-medium">Reference images</h4>
        {references.length === 0 ? (
          <p className="text-sm text-muted">
            No stored reference images yet. A text prompt is not a reference image.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {references.map((asset) => (
              <li key={asset.id} className="rounded-md border border-border p-3 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/references/${asset.id}`}
                  alt={asset.original_filename ?? character.name}
                  className="mb-2 h-40 w-full rounded object-cover bg-background"
                />
                <p className="font-medium">
                  {asset.is_primary ? 'Primary · ' : ''}
                  {asset.original_filename ?? 'reference'}
                </p>
                <p className="font-mono text-xs text-muted break-all">
                  {asset.id.slice(0, 8)}… · sha {asset.checksum_sha256?.slice(0, 12)}…
                </p>
                {asset.notes ? <p className="mt-1 text-muted">{asset.notes}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {!asset.is_primary ? (
                    <form
                      action={setPrimaryReferenceAction.bind(
                        null,
                        projectId,
                        character.id,
                        asset.id,
                      )}
                    >
                      <button type="submit" className="text-xs text-accent hover:underline">
                        Make primary
                      </button>
                    </form>
                  ) : null}
                  <form action={removeCharacterReferenceAction.bind(null, projectId, asset.id)}>
                    <button
                      type="submit"
                      className="text-xs text-danger hover:underline"
                      onClick={(event) => {
                        if (!confirm('Remove this reference image from the character?')) {
                          event.preventDefault();
                        }
                      }}
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <CharacterReferenceUpload projectId={projectId} characterId={character.id} />
      </div>
    </article>
  );
}
