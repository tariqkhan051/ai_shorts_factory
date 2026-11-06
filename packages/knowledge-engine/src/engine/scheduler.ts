import type { AutonomousMlbbKnowledgeEngine } from './autonomous-engine.js';
import { sleep } from '../util.js';

export type KnowledgeEngineSchedulerOptions = {
  engine: AutonomousMlbbKnowledgeEngine;
  userId: string;
  /** Poll interval for due jobs (ms). Default 60s. */
  pollIntervalMs?: number;
  lockOwner?: string;
  onTick?: (info: { ran: number }) => void;
  shouldStop?: () => boolean;
};

/**
 * Lightweight in-process scheduler for the Autonomous Knowledge Engine.
 * Prefer this (or media-worker KB jobs) over Supabase free-tier background execution.
 */
export async function runKnowledgeEngineSchedulerLoop(
  options: KnowledgeEngineSchedulerOptions,
): Promise<void> {
  const poll = options.pollIntervalMs ?? 60_000;
  const lockOwner = options.lockOwner ?? `kb-scheduler:${process.pid}`;
  while (!options.shouldStop?.()) {
    const results = await options.engine.runDueJobs(options.userId, lockOwner);
    options.onTick?.({ ran: results.length });
    await sleep(poll);
  }
}
