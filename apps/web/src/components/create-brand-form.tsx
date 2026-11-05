'use client';

import { useActionState } from 'react';
import { createBrandAction, type BrandActionState } from '@/app/brands/actions';

const initial: BrandActionState = { ok: false };

export function CreateBrandForm() {
  const [state, action, pending] = useActionState(createBrandAction, initial);

  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-background-elevated/50 p-5">
      <h2 className="text-lg font-medium">Create brand</h2>
      {state.message ? (
        <p className={`text-sm ${state.ok ? 'text-accent' : 'text-danger'}`}>{state.message}</p>
      ) : null}
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Name</span>
        <input name="name" required className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Description</span>
        <textarea name="description" rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Target audience</span>
        <input name="target_audience" className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Brand voice</span>
        <textarea name="brand_voice" rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Create brand'}
      </button>
    </form>
  );
}
