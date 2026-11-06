'use client';

import { useState } from 'react';
import { addProjectCharacterAction } from '@/app/projects/[id]/characters/actions';
import { IconClose, IconPlus } from '@/components/icons';

export function AddProjectCharacterPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-background-elevated"
        >
          <IconPlus className="h-4 w-4" />
          Add character
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-background-elevated/50 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-base font-medium">
          <IconPlus className="h-4 w-4 text-muted" />
          Add character
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-muted hover:bg-background hover:text-foreground"
          aria-label="Close add character form"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>
      <form
        action={addProjectCharacterAction.bind(null, projectId)}
        className="grid gap-3 sm:grid-cols-2"
      >
        <input name="name" required placeholder="Name" className="field-input" autoFocus />
        <input
          name="screenplay_character_id"
          placeholder="character_id (optional)"
          className="field-input"
        />
        <input
          name="visual_identity"
          required
          placeholder="Visual identity"
          className="field-input sm:col-span-2"
        />
        <input
          name="description"
          required
          placeholder="Description"
          className="field-input sm:col-span-2"
        />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button
            type="submit"
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-background hover:bg-accent/90"
          >
            <IconPlus className="h-4 w-4" />
            Save character
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-10 items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-background"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
