'use client';

import { useActionState } from 'react';
import {
  createSocialAccountAction,
  type SocialActionState,
} from '@/app/social-accounts/actions';

const initial: SocialActionState = { ok: false };

export function CreateSocialAccountForm({
  platforms,
  brands,
}: {
  platforms: string[];
  brands: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(createSocialAccountAction, initial);

  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-background-elevated/50 p-5">
      <h2 className="text-lg font-medium">Register account</h2>
      {state.message ? (
        <p className={`text-sm ${state.ok ? 'text-accent' : 'text-danger'}`}>{state.message}</p>
      ) : null}
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Platform</span>
        <select name="platform" required className="w-full rounded-md border border-border bg-background px-3 py-2" defaultValue="youtube">
          {platforms.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Display name</span>
        <input name="display_name" required className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Handle / username</span>
        <input name="handle" required className="w-full rounded-md border border-border bg-background px-3 py-2" placeholder="@channel" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Brand (optional)</span>
        <select name="brand_id" className="w-full rounded-md border border-border bg-background px-3 py-2" defaultValue="">
          <option value="">None</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Default caption rules</span>
        <textarea name="default_caption_rules" rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Default hashtag rules</span>
        <textarea name="default_hashtag_rules" rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Register account'}
      </button>
    </form>
  );
}
