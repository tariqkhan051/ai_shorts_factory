/**
 * Bounded exponential backoff with full jitter.
 * attempt is 1-based.
 */
export function computeBackoffDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random,
): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  return Math.floor(random() * exp);
}

export function nextRetryIso(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  nowMs = Date.now(),
): string {
  const delay = computeBackoffDelayMs(attempt, baseDelayMs, maxDelayMs);
  return new Date(nowMs + delay).toISOString();
}
