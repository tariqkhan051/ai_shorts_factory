'use client';

import { useActionState, useState } from 'react';
import {
  uploadCharacterReferenceAction,
  type CharacterActionState,
} from '@/app/projects/[id]/characters/actions';

const initialState: CharacterActionState = { ok: false };

export function CharacterReferenceUpload({
  projectId,
  characterId,
}: {
  projectId: string;
  characterId: string;
}) {
  const action = uploadCharacterReferenceAction.bind(null, projectId, characterId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [dragOver, setDragOver] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={() => setDragOver(false)}
        className={`rounded-md border border-dashed px-3 py-4 text-sm ${
          dragOver ? 'border-accent bg-accent/5' : 'border-border'
        }`}
      >
        <label className="block space-y-2">
          <span className="text-xs uppercase tracking-wide text-muted">
            Upload reference (PNG / JPEG / WebP)
          </span>
          <input
            type="file"
            name="image"
            accept="image/png,image/jpeg,image/webp"
            required
            className="block w-full text-sm"
          />
        </label>
      </div>
      <input
        name="notes"
        placeholder="Optional notes about this reference"
        className="field-input"
      />
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="is_primary" value="true" defaultChecked />
        Set as primary reference
      </label>
      {state.message ? (
        <p className={`text-sm ${state.ok ? 'text-success' : 'text-danger'}`}>{state.message}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background disabled:opacity-60"
      >
        {pending ? 'Uploading…' : 'Upload reference image'}
      </button>
    </form>
  );
}
