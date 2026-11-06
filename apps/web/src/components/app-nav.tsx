'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState, type ComponentType, type SVGProps } from 'react';
import {
  IconBook,
  IconBrand,
  IconClapper,
  IconClose,
  IconFolder,
  IconHome,
  IconLogIn,
  IconMark,
  IconMenu,
  IconSettings,
  IconShare,
  IconUsers,
} from '@/components/icons';
import { NotificationCenter } from '@/components/notification-center';
import { SignOutButton } from '@/components/sign-out-button';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export const NAV_ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  short?: string;
  Icon: IconComponent;
}> = [
  { href: '/', label: 'Dashboard', Icon: IconHome },
  { href: '/brands', label: 'Brands', Icon: IconBrand },
  { href: '/projects', label: 'Projects', Icon: IconFolder },
  { href: '/social-accounts', label: 'Social', Icon: IconShare },
  { href: '/characters', label: 'Characters', Icon: IconUsers },
  { href: '/game-knowledge', label: 'Game KB', short: 'KB', Icon: IconBook },
  { href: '/match-studio', label: 'Match Studio', short: 'Match', Icon: IconClapper },
  { href: '/settings', label: 'Settings', Icon: IconSettings },
];

type AppNavProps = {
  store: string;
  supabaseConfigured: boolean;
  user: { mode: 'supabase' | 'memory'; email: string } | null;
};

function isActivePath(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AuthControls({
  user,
  store,
  supabaseConfigured,
  compact,
}: {
  user: AppNavProps['user'];
  store: string;
  supabaseConfigured: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? 'flex items-center gap-2 text-xs text-muted'
          : 'flex flex-col gap-2 border-t border-border pt-3 text-sm text-muted'
      }
    >
      <span className="rounded bg-background-elevated px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide">
        {store}
      </span>
      {user?.mode === 'supabase' ? (
        <SignOutButton />
      ) : supabaseConfigured ? (
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-accent hover:underline"
        >
          <IconLogIn className="h-3.5 w-3.5" />
          Sign in
        </Link>
      ) : (
        <span>local-dev</span>
      )}
    </div>
  );
}

export function AppNav({ user, store, supabaseConfigured }: AppNavProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2 truncate">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
            <IconMark className="h-4 w-4" />
          </span>
          <span className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
            Shorts Factory
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
            {NAV_ITEMS.map((item) => {
              const active = isActivePath(pathname, item.href);
              const { Icon } = item;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-background-elevated text-foreground'
                      : 'text-muted hover:bg-background-elevated hover:text-foreground'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-3.5 w-3.5 opacity-80" />
                  <span>{item.short ?? item.label}</span>
                </Link>
              );
            })}
          </nav>

          {user ? <NotificationCenter /> : null}

          <div className="hidden items-center gap-2 border-l border-border pl-3 md:flex">
            <AuthControls
              user={user}
              store={store}
              supabaseConfigured={supabaseConfigured}
              compact
            />
          </div>

          <button
            type="button"
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-background-elevated hover:text-foreground lg:hidden"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <IconClose className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div
          id={menuId}
          className="max-h-[min(70vh,28rem)] overflow-y-auto border-t border-border bg-background lg:hidden"
        >
          <nav className="mx-auto flex max-w-6xl flex-col gap-0.5 px-3 py-2 sm:px-5" aria-label="Mobile">
            {NAV_ITEMS.map((item) => {
              const active = isActivePath(pathname, item.href);
              const { Icon } = item;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-3 rounded-md px-3 py-3 text-base transition-colors ${
                    active
                      ? 'bg-background-elevated text-foreground'
                      : 'text-muted hover:bg-background-elevated hover:text-foreground'
                  }`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <AuthControls user={user} store={store} supabaseConfigured={supabaseConfigured} />
          </nav>
        </div>
      ) : null}
    </header>
  );
}
