import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getAppEnv } from '@/lib/env';
import { NotificationCenter } from '@/components/notification-center';
import { PwaRegister } from '@/components/pwa-register';
import { SignOutButton } from '@/components/sign-out-button';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/characters', label: 'Characters' },
  { href: '/library', label: 'Library' },
  { href: '/settings', label: 'Settings' },
] as const;

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const env = getAppEnv();

  return (
    <div className="min-h-screen">
      <PwaRegister />
      <header className="border-b border-border/80 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="group flex items-baseline gap-3">
            <span className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              AI Shorts Factory
            </span>
            <span className="hidden font-mono text-xs text-muted sm:inline">studio</span>
          </Link>
          <div className="flex items-center gap-3">
            <nav className="flex flex-wrap items-center gap-1 sm:gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-background-elevated hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            {user ? <NotificationCenter /> : null}
            <div className="hidden items-center gap-2 border-l border-border pl-3 text-xs text-muted sm:flex">
              <span className="font-mono">{env.database.store}</span>
              {user?.mode === 'supabase' ? (
                <SignOutButton />
              ) : env.supabaseConfigured ? (
                <Link href="/login" className="text-accent hover:underline">
                  Sign in
                </Link>
              ) : (
                <span>local-dev</span>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
