import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAppEnv } from '@/lib/env';
import { getCurrentUser } from '@/lib/auth';
import { LoginForm } from '@/components/login-form';

export default async function LoginPage() {
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
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted">
          Supabase Auth protects project data. Service-role keys stay server-side only.
        </p>
      </div>
      {!env.supabaseConfigured ? (
        <div className="rounded-lg border border-warning/40 bg-background-elevated/60 px-4 py-4 text-sm text-warning">
          Supabase env vars are missing. Set `NEXT_PUBLIC_SUPABASE_URL` and
          `NEXT_PUBLIC_SUPABASE_ANON_KEY`, or keep `PROJECT_STORE=memory` for local project CRUD.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-background-elevated/50 p-5">
          <LoginForm />
        </div>
      )}
      <p className="text-sm text-muted">
        No account?{' '}
        <Link href="/signup" className="text-accent hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
