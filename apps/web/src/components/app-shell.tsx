import Link from 'next/link';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/library', label: 'Library' },
  { href: '/settings', label: 'Settings' },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border/80 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="group flex items-baseline gap-3">
            <span className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              AI Shorts Factory
            </span>
            <span className="hidden font-mono text-xs text-muted sm:inline">studio</span>
          </Link>
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
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
