import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAppEnv } from '@/lib/env';

export type AppUser = {
  id: string;
  email: string;
  mode: 'supabase' | 'memory';
};

/** Must match CLI/bootstrap + memory repository local identity. */
const MEMORY_DEV_USER_ID = 'local-dev-user';

/**
 * Resolves the current user.
 * - Supabase mode: authenticated session required for mutating routes.
 * - Memory mode: deterministic local developer identity (not production).
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  const env = getAppEnv();

  if (env.database.store === 'memory') {
    return {
      id: MEMORY_DEV_USER_ID,
      email: 'local-dev@ai-shorts-factory.local',
      mode: 'memory',
    };
  }

  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? '',
    mode: 'supabase',
  };
}

export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  return user;
}
