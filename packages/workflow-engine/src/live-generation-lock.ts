import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Live Google Flow concurrency lock.
 * Combines process-local counting with an exclusive lock file so two worker
 * processes cannot submit paid generations at the same time.
 */

let activeLiveGenerations = 0;
let fileLockHeld = false;

function lockFilePath(): string {
  return (
    process.env.FLOW_LIVE_LOCK_PATH?.trim() || join(tmpdir(), 'asf-flow-live-generation.lock')
  );
}

function staleMs(): number {
  const parsed = Number(process.env.FLOW_LIVE_LOCK_STALE_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15 * 60_000;
}

function tryAcquireFileLock(): boolean {
  const path = lockFilePath();
  mkdirSync(dirname(path), { recursive: true });
  const payload = JSON.stringify({ pid: process.pid, at: Date.now() });

  try {
    writeFileSync(path, payload, { flag: 'wx' });
    return true;
  } catch {
    try {
      const existing = JSON.parse(readFileSync(path, 'utf8')) as { at?: number };
      const age = Date.now() - (existing.at ?? 0);
      if (age > staleMs()) {
        unlinkSync(path);
        writeFileSync(path, payload, { flag: 'wx' });
        return true;
      }
    } catch {
      // Contended or unreadable — treat as held.
    }
    return false;
  }
}

function releaseFileLock(): void {
  if (!fileLockHeld) return;
  try {
    unlinkSync(lockFilePath());
  } catch {
    // Best-effort; stale reclaim handles leftovers.
  }
  fileLockHeld = false;
}

export function tryAcquireLiveGenerationSlot(maxSimultaneous = 1): boolean {
  if (maxSimultaneous < 1) {
    return false;
  }
  if (activeLiveGenerations >= maxSimultaneous) {
    return false;
  }

  // Cross-process exclusive lock always caps at one live Flow submission.
  if (!tryAcquireFileLock()) {
    return false;
  }

  activeLiveGenerations += 1;
  fileLockHeld = true;
  return true;
}

export function releaseLiveGenerationSlot(): void {
  if (activeLiveGenerations > 0) {
    activeLiveGenerations -= 1;
  }
  releaseFileLock();
}

export function getActiveLiveGenerationCount(): number {
  return activeLiveGenerations;
}

/** Test helper only. */
export function resetLiveGenerationSlotsForTests(): void {
  activeLiveGenerations = 0;
  releaseFileLock();
  try {
    unlinkSync(lockFilePath());
  } catch {
    // ignore
  }
}
