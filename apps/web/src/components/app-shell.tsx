import { AppNav } from '@/components/app-nav';
import { NavigationProgress } from '@/components/navigation-progress';
import { PwaRegister } from '@/components/pwa-register';
import { getCurrentUser } from '@/lib/auth';
import { getAppEnv } from '@/lib/env';

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const env = getAppEnv();

  return (
    <div className="min-h-screen">
      <PwaRegister />
      <NavigationProgress />
      <AppNav
        user={user ? { mode: user.mode, email: user.email } : null}
        store={env.database.store}
        supabaseConfigured={env.supabaseConfigured}
      />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
