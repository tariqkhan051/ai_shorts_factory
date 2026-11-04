import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAppEnv } from '@/lib/env';
import { getCurrentUser } from '@/lib/auth';
import { SignupForm } from '@/components/signup-form';

export default async function SignupPage() {
  const env = getAppEnv();
  const user = await getCurrentUser();

  if (env.database.store === 'memory') {
    redirect('/projects');
  }

  if (user?.mode === 'supabase') {
    redirect('/');
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Create account</h1>
        <p className="text-muted">Email/password signup via Supabase Auth.</p>
      </div>
      {!env.supabaseConfigured ? (
        <div className="rounded-lg border border-warning/40 bg-background-elevated/60 px-4 py-4 text-sm text-warning">
          Configure Supabase public env vars before creating accounts.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-background-elevated/50 p-5">
          <SignupForm />
        </div>
      )}
      <p className="text-sm text-muted">
        Already registered?{' '}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
