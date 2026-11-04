'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const displayName = String(formData.get('display_name') ?? '');

    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || undefined },
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (data.session) {
        router.replace('/');
        router.refresh();
        return;
      }
      setMessage('Check your email to confirm the account, then sign in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1.5" htmlFor="display_name">
        <span className="text-sm text-muted">Display name</span>
        <input id="display_name" name="display_name" className="field-input" />
      </label>
      <label className="block space-y-1.5" htmlFor="email">
        <span className="text-sm text-muted">Email</span>
        <input id="email" name="email" type="email" required className="field-input" />
      </label>
      <label className="block space-y-1.5" htmlFor="password">
        <span className="text-sm text-muted">Password</span>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className="field-input"
        />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90 disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create account'}
      </button>
    </form>
  );
}
