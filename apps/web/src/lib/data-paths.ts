import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Resolve durable `.data/*` paths for the Next.js app.
 * Dev servers often run with cwd=`apps/web`, while CLIs write to the monorepo root `.data`.
 */
export function resolveDataFile(fileName: string, envValue?: string | null): string {
  const fromEnv = envValue?.trim();
  if (fromEnv) return fromEnv;

  const cwd = process.cwd();
  const local = join(cwd, '.data', fileName);
  const monorepoRoot = join(cwd, '..', '..', '.data', fileName);

  const looksLikeAppsWeb =
    /[/\\]apps[/\\]web$/i.test(cwd.replace(/[/\\]+$/, '')) ||
    existsSync(join(cwd, 'next.config.ts')) ||
    existsSync(join(cwd, 'next.config.mjs')) ||
    existsSync(join(cwd, 'next.config.js'));

  if (looksLikeAppsWeb) {
    if (existsSync(monorepoRoot)) return monorepoRoot;
    if (existsSync(local)) return local;
    return monorepoRoot;
  }

  if (existsSync(local)) return local;
  if (existsSync(monorepoRoot)) return monorepoRoot;
  return local;
}
