'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconLogOut, IconUser } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';

type SignOutButtonProps = {
  email?: string;
};

export function SignOutButton({ email }: SignOutButtonProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function signOut() {
    setPending(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      setOpen(false);
      router.replace('/login');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-background-elevated hover:text-foreground"
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <IconUser className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-[min(16rem,calc(100vw-1.5rem))] rounded-lg border border-border bg-background-elevated p-1.5 shadow-lg"
        >
          {email ? (
            <p className="truncate px-2.5 py-2 text-xs text-muted" title={email}>
              {email}
            </p>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            disabled={pending}
            className="inline-flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-background disabled:opacity-60"
          >
            <IconLogOut className="h-4 w-4 text-muted" />
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
