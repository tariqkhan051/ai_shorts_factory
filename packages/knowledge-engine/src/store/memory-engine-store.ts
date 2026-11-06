import { KNOWLEDGE_ENGINE_SCHEDULE_DEFAULTS } from '@ai-shorts-factory/shared-types';
import type {
  KnowledgeBattleSpellRecord,
  KnowledgeEmblemRecord,
  KnowledgeEngineState,
  KnowledgeEngineStats,
  KnowledgeEsportsRecord,
  KnowledgeItemRecord,
  KnowledgeMapRecord,
  KnowledgeMonsterRecord,
  KnowledgePatchExtRecord,
  KnowledgeSchedulerConfig,
  KnowledgeStrategyRecord,
  KnowledgeSyncJob,
  KnowledgeSyncLog,
  KnowledgeVersionRecord,
  MonitoredSource,
  ServerType,
} from '../types.js';
import { exponentialBackoffMs, hoursFromNow, newId, nowIso } from '../util.js';
import { createDefaultMonitoredSources } from '../sources/registry.js';

function emptyStats(): KnowledgeEngineStats {
  return {
    heroes_discovered: 0,
    heroes_synchronized: 0,
    items: 0,
    emblems: 0,
    battle_spells: 0,
    patches: 0,
    strategies: 0,
    esports: 0,
    original_status: 'empty',
    advance_status: 'empty',
    pending_validation: 0,
    failed_jobs: 0,
    sources_monitored: 0,
    recently_discovered_changes: 0,
  };
}

function defaultSchedulerConfig(): KnowledgeSchedulerConfig {
  return {
    ...KNOWLEDGE_ENGINE_SCHEDULE_DEFAULTS,
    enabled: true,
  };
}

export type MemoryEngineSnapshot = {
  sources: MonitoredSource[];
  jobs: KnowledgeSyncJob[];
  logs: KnowledgeSyncLog[];
  items: KnowledgeItemRecord[];
  emblems: KnowledgeEmblemRecord[];
  spells: KnowledgeBattleSpellRecord[];
  maps: KnowledgeMapRecord[];
  monsters: KnowledgeMonsterRecord[];
  patchesExt: KnowledgePatchExtRecord[];
  strategies: KnowledgeStrategyRecord[];
  esports: KnowledgeEsportsRecord[];
  versions: KnowledgeVersionRecord[];
  ingestionHashes: Array<{
    content_sha256: string;
    source_key: string;
    server_type: ServerType | null;
    last_status: string;
    entity_ref: string | null;
    updated_at: string;
  }>;
  states: KnowledgeEngineState[];
};

/**
 * In-memory Autonomous Knowledge Engine store.
 * Mirrors Supabase tables for local/dev and tests; persist via file snapshot.
 */
export class MemoryKnowledgeEngineStore {
  private sources = new Map<string, MonitoredSource>();
  private jobs = new Map<string, KnowledgeSyncJob>();
  private logs: KnowledgeSyncLog[] = [];
  private items = new Map<string, KnowledgeItemRecord>();
  private emblems = new Map<string, KnowledgeEmblemRecord>();
  private spells = new Map<string, KnowledgeBattleSpellRecord>();
  private maps = new Map<string, KnowledgeMapRecord>();
  private monsters = new Map<string, KnowledgeMonsterRecord>();
  private patchesExt = new Map<string, KnowledgePatchExtRecord>();
  private strategies = new Map<string, KnowledgeStrategyRecord>();
  private esports = new Map<string, KnowledgeEsportsRecord>();
  private versions: KnowledgeVersionRecord[] = [];
  private ingestionHashes = new Map<
    string,
    {
      content_sha256: string;
      source_key: string;
      server_type: ServerType | null;
      last_status: string;
      entity_ref: string | null;
      updated_at: string;
    }
  >();
  private states = new Map<string, KnowledgeEngineState>();

  ensureDefaults(userId: string): KnowledgeEngineState {
    let state = this.states.get(userId);
    if (!state) {
      state = {
        user_id: userId,
        activated: false,
        scheduler_config: defaultSchedulerConfig(),
        last_sync_at: null,
        next_sync_at: null,
        last_initial_ingestion_at: null,
        stats_json: emptyStats(),
        updated_at: nowIso(),
      };
      this.states.set(userId, state);
    }
    if (![...this.sources.values()].some((s) => (s.metadata as { user_id?: string }).user_id === userId)) {
      for (const source of createDefaultMonitoredSources()) {
        this.sources.set(source.id, {
          ...source,
          metadata: { ...source.metadata, user_id: userId },
        });
      }
    }
    return structuredClone(state);
  }

  getState(userId: string): KnowledgeEngineState {
    return structuredClone(this.ensureDefaults(userId));
  }

  setActivated(userId: string, activated: boolean): KnowledgeEngineState {
    const state = this.ensureDefaults(userId);
    state.activated = activated;
    state.updated_at = nowIso();
    if (activated && !state.next_sync_at) {
      state.next_sync_at = hoursFromNow(state.scheduler_config.patch_monitor_hours);
    }
    this.states.set(userId, state);
    return structuredClone(state);
  }

  updateStats(userId: string, patch: Partial<KnowledgeEngineStats>): KnowledgeEngineState {
    const state = this.ensureDefaults(userId);
    state.stats_json = { ...state.stats_json, ...patch };
    state.stats_json.sources_monitored = this.listSources(userId).filter((s) => s.enabled).length;
    state.updated_at = nowIso();
    this.states.set(userId, state);
    return structuredClone(state);
  }

  touchSync(userId: string, nextHours: number): KnowledgeEngineState {
    const state = this.ensureDefaults(userId);
    state.last_sync_at = nowIso();
    state.next_sync_at = hoursFromNow(nextHours);
    state.updated_at = nowIso();
    this.states.set(userId, state);
    return structuredClone(state);
  }

  listSources(userId: string): MonitoredSource[] {
    this.ensureDefaults(userId);
    return [...this.sources.values()]
      .filter((s) => (s.metadata as { user_id?: string }).user_id === userId)
      .map((s) => structuredClone(s));
  }

  setSourceEnabled(userId: string, sourceKey: string, enabled: boolean): MonitoredSource | null {
    const source = this.listSources(userId).find((s) => s.source_key === sourceKey);
    if (!source) return null;
    const updated = { ...source, enabled };
    this.sources.set(source.id, {
      ...updated,
      metadata: { ...updated.metadata, user_id: userId },
    });
    return structuredClone(updated);
  }

  updateSourceCheck(
    userId: string,
    sourceKey: string,
    update: { error?: string | null; success?: boolean },
  ): void {
    const source = this.listSources(userId).find((s) => s.source_key === sourceKey);
    if (!source) return;
    source.last_checked_at = nowIso();
    if (update.success) {
      source.last_success_at = nowIso();
      source.last_error = null;
    }
    if (update.error) source.last_error = update.error;
    this.sources.set(source.id, {
      ...source,
      metadata: { ...source.metadata, user_id: userId },
    });
  }

  enqueueJob(input: {
    userId: string;
    kind: KnowledgeSyncJob['kind'];
    serverType?: ServerType | null;
    idempotencyKey: string;
    inputJson?: Record<string, unknown>;
    maxAttempts?: number;
  }): KnowledgeSyncJob {
    const existing = [...this.jobs.values()].find(
      (j) => j.user_id === input.userId && j.idempotency_key === input.idempotencyKey,
    );
    if (existing) return structuredClone(existing);
    const timestamp = nowIso();
    const job: KnowledgeSyncJob = {
      id: newId(),
      user_id: input.userId,
      kind: input.kind,
      status: 'queued',
      server_type: input.serverType ?? null,
      lock_owner: null,
      lock_expires_at: null,
      attempt: 0,
      max_attempts: input.maxAttempts ?? KNOWLEDGE_ENGINE_SCHEDULE_DEFAULTS.max_retries,
      scheduled_at: timestamp,
      started_at: null,
      finished_at: null,
      next_retry_at: null,
      idempotency_key: input.idempotencyKey,
      input_json: input.inputJson ?? {},
      result_json: {},
      error_message: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.jobs.set(job.id, job);
    return structuredClone(job);
  }

  /**
   * Claim next runnable job with lock. Prevents concurrent duplicate syncs for same kind+server.
   */
  claimJob(userId: string, lockOwner: string, lockTtlSeconds: number): KnowledgeSyncJob | null {
    const now = Date.now();
    const candidates = [...this.jobs.values()]
      .filter((j) => j.user_id === userId)
      .filter((j) => {
        if (j.status === 'queued') return Date.parse(j.scheduled_at) <= now;
        if (j.status === 'failed' && j.next_retry_at && Date.parse(j.next_retry_at) <= now) {
          return j.attempt < j.max_attempts;
        }
        if (
          j.status === 'running' &&
          j.lock_expires_at &&
          Date.parse(j.lock_expires_at) < now
        ) {
          return true; // expired lock reclaim
        }
        return false;
      })
      .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));

    for (const candidate of candidates) {
      const concurrent = [...this.jobs.values()].some(
        (j) =>
          j.id !== candidate.id &&
          j.user_id === userId &&
          j.kind === candidate.kind &&
          j.server_type === candidate.server_type &&
          j.status === 'running' &&
          j.lock_expires_at &&
          Date.parse(j.lock_expires_at) > now,
      );
      if (concurrent) {
        candidate.status = 'skipped_locked';
        candidate.updated_at = nowIso();
        candidate.finished_at = nowIso();
        candidate.error_message = 'Concurrent sync already running';
        this.jobs.set(candidate.id, candidate);
        continue;
      }

      candidate.status = 'running';
      candidate.lock_owner = lockOwner;
      candidate.lock_expires_at = new Date(now + lockTtlSeconds * 1000).toISOString();
      candidate.started_at = nowIso();
      candidate.attempt += 1;
      candidate.updated_at = nowIso();
      this.jobs.set(candidate.id, candidate);
      return structuredClone(candidate);
    }
    return null;
  }

  completeJob(jobId: string, result: Record<string, unknown>): KnowledgeSyncJob {
    const job = this.requireJob(jobId);
    job.status = 'succeeded';
    job.result_json = result;
    job.finished_at = nowIso();
    job.lock_owner = null;
    job.lock_expires_at = null;
    job.error_message = null;
    job.updated_at = nowIso();
    this.jobs.set(job.id, job);
    return structuredClone(job);
  }

  failJob(jobId: string, error: string): KnowledgeSyncJob {
    const job = this.requireJob(jobId);
    job.error_message = error;
    job.updated_at = nowIso();
    if (job.attempt >= job.max_attempts) {
      job.status = 'failed';
      job.finished_at = nowIso();
      job.lock_owner = null;
      job.lock_expires_at = null;
      job.next_retry_at = null;
    } else {
      job.status = 'failed';
      job.next_retry_at = new Date(Date.now() + exponentialBackoffMs(job.attempt)).toISOString();
      job.lock_owner = null;
      job.lock_expires_at = null;
    }
    this.jobs.set(job.id, job);
    return structuredClone(job);
  }

  appendLog(
    jobId: string,
    userId: string,
    level: KnowledgeSyncLog['level'],
    message: string,
    details: Record<string, unknown> = {},
  ): void {
    this.logs.push({
      id: newId(),
      job_id: jobId,
      user_id: userId,
      level,
      message,
      details,
      created_at: nowIso(),
    });
  }

  listJobs(userId: string): KnowledgeSyncJob[] {
    return [...this.jobs.values()]
      .filter((j) => j.user_id === userId)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .map((j) => structuredClone(j));
  }

  listLogs(userId: string, jobId?: string): KnowledgeSyncLog[] {
    return this.logs
      .filter((l) => l.user_id === userId && (!jobId || l.job_id === jobId))
      .slice(-500)
      .map((l) => structuredClone(l));
  }

  hasIngestionHash(userId: string, contentSha: string): boolean {
    return this.ingestionHashes.has(`${userId}:${contentSha}`);
  }

  saveIngestionHash(input: {
    userId: string;
    contentSha: string;
    sourceKey: string;
    serverType: ServerType | null;
    status: string;
    entityRef?: string | null;
  }): void {
    this.ingestionHashes.set(`${input.userId}:${input.contentSha}`, {
      content_sha256: input.contentSha,
      source_key: input.sourceKey,
      server_type: input.serverType,
      last_status: input.status,
      entity_ref: input.entityRef ?? null,
      updated_at: nowIso(),
    });
  }

  upsertItem(record: KnowledgeItemRecord): KnowledgeItemRecord {
    const key = `${record.user_id}:${record.server_type}:${record.patch_version}:${record.item_key}`;
    const existing = [...this.items.values()].find(
      (i) =>
        i.user_id === record.user_id &&
        i.server_type === record.server_type &&
        i.patch_version === record.patch_version &&
        i.item_key === record.item_key,
    );
    if (existing) {
      if (existing.content_sha256 && existing.content_sha256 === record.content_sha256) {
        return structuredClone(existing);
      }
      this.versions.push({
        id: newId(),
        user_id: existing.user_id,
        entity_table: 'knowledge_items',
        entity_id: existing.id,
        record_version: existing.record_version,
        snapshot_json: existing as unknown as Record<string, unknown>,
        change_summary: 'item updated',
        content_sha256: existing.content_sha256,
        created_at: nowIso(),
      });
      const updated = {
        ...record,
        id: existing.id,
        first_discovered_at: existing.first_discovered_at,
        record_version: existing.record_version + 1,
      };
      this.items.set(updated.id, updated);
      return structuredClone(updated);
    }
    this.items.set(record.id, record);
    void key;
    return structuredClone(record);
  }

  upsertPatchExt(record: KnowledgePatchExtRecord): KnowledgePatchExtRecord {
    const existing = [...this.patchesExt.values()].find(
      (p) =>
        p.user_id === record.user_id &&
        p.game_profile_id === record.game_profile_id &&
        p.server_type === record.server_type &&
        p.patch_identifier === record.patch_identifier,
    );
    if (existing) {
      if (existing.content_sha256 && existing.content_sha256 === record.content_sha256) {
        return structuredClone(existing);
      }
      this.versions.push({
        id: newId(),
        user_id: existing.user_id,
        entity_table: 'knowledge_patches_ext',
        entity_id: existing.id,
        record_version: existing.record_version,
        snapshot_json: existing as unknown as Record<string, unknown>,
        change_summary: 'patch summary updated',
        content_sha256: existing.content_sha256,
        created_at: nowIso(),
      });
      const updated = {
        ...record,
        id: existing.id,
        first_discovered_at: existing.first_discovered_at,
        record_version: existing.record_version + 1,
        related_advance_patch_id: existing.related_advance_patch_id,
        related_original_patch_id: existing.related_original_patch_id,
      };
      this.patchesExt.set(updated.id, updated);
      return structuredClone(updated);
    }
    this.patchesExt.set(record.id, record);
    return structuredClone(record);
  }

  linkAdvanceToOriginal(advanceId: string, originalId: string): void {
    const advance = this.patchesExt.get(advanceId);
    const original = this.patchesExt.get(originalId);
    if (!advance || !original) return;
    if (advance.server_type !== 'advance' || original.server_type !== 'original') {
      throw new Error('Cannot link: Advance/Original server types mismatch');
    }
    advance.related_original_patch_id = original.id;
    original.related_advance_patch_id = advance.id;
    this.patchesExt.set(advance.id, advance);
    this.patchesExt.set(original.id, original);
  }

  listItems(userId: string, serverType?: ServerType): KnowledgeItemRecord[] {
    return [...this.items.values()]
      .filter((i) => i.user_id === userId && (!serverType || i.server_type === serverType))
      .map((i) => structuredClone(i));
  }

  listPatchesExt(userId: string, serverType?: ServerType): KnowledgePatchExtRecord[] {
    return [...this.patchesExt.values()]
      .filter((p) => p.user_id === userId && (!serverType || p.server_type === serverType))
      .map((p) => structuredClone(p));
  }

  listStrategies(userId: string, serverType?: ServerType): KnowledgeStrategyRecord[] {
    return [...this.strategies.values()]
      .filter((s) => s.user_id === userId && (!serverType || s.server_type === serverType))
      .map((s) => structuredClone(s));
  }

  upsertStrategy(record: KnowledgeStrategyRecord): KnowledgeStrategyRecord {
    const existing = [...this.strategies.values()].find(
      (s) =>
        s.user_id === record.user_id &&
        s.server_type === record.server_type &&
        s.patch_version === record.patch_version &&
        s.strategy_key === record.strategy_key,
    );
    if (existing) {
      const updated = { ...record, id: existing.id, first_discovered_at: existing.first_discovered_at, record_version: existing.record_version + 1 };
      this.strategies.set(updated.id, updated);
      return structuredClone(updated);
    }
    this.strategies.set(record.id, record);
    return structuredClone(record);
  }

  upsertSpell(record: KnowledgeBattleSpellRecord): KnowledgeBattleSpellRecord {
    const existing = [...this.spells.values()].find(
      (s) =>
        s.user_id === record.user_id &&
        s.server_type === record.server_type &&
        s.patch_version === record.patch_version &&
        s.spell_key === record.spell_key,
    );
    if (existing) {
      const updated = { ...record, id: existing.id, first_discovered_at: existing.first_discovered_at, record_version: existing.record_version + 1 };
      this.spells.set(updated.id, updated);
      return structuredClone(updated);
    }
    this.spells.set(record.id, record);
    return structuredClone(record);
  }

  upsertMap(record: KnowledgeMapRecord): KnowledgeMapRecord {
    const existing = [...this.maps.values()].find(
      (m) =>
        m.user_id === record.user_id &&
        m.server_type === record.server_type &&
        m.patch_version === record.patch_version &&
        m.map_key === record.map_key,
    );
    if (existing) {
      const updated = { ...record, id: existing.id, first_discovered_at: existing.first_discovered_at, record_version: existing.record_version + 1 };
      this.maps.set(updated.id, updated);
      return structuredClone(updated);
    }
    this.maps.set(record.id, record);
    return structuredClone(record);
  }

  upsertMonster(record: KnowledgeMonsterRecord): KnowledgeMonsterRecord {
    const existing = [...this.monsters.values()].find(
      (m) =>
        m.user_id === record.user_id &&
        m.server_type === record.server_type &&
        m.patch_version === record.patch_version &&
        m.monster_key === record.monster_key,
    );
    if (existing) {
      const updated = { ...record, id: existing.id, first_discovered_at: existing.first_discovered_at, record_version: existing.record_version + 1 };
      this.monsters.set(updated.id, updated);
      return structuredClone(updated);
    }
    this.monsters.set(record.id, record);
    return structuredClone(record);
  }

  upsertEsports(record: KnowledgeEsportsRecord): KnowledgeEsportsRecord {
    const existing = [...this.esports.values()].find(
      (e) => e.user_id === record.user_id && e.record_key === record.record_key,
    );
    if (existing) {
      const updated = { ...record, id: existing.id, first_discovered_at: existing.first_discovered_at, record_version: existing.record_version + 1 };
      this.esports.set(updated.id, updated);
      return structuredClone(updated);
    }
    this.esports.set(record.id, record);
    return structuredClone(record);
  }

  listSpells(userId: string): KnowledgeBattleSpellRecord[] {
    return [...this.spells.values()].filter((s) => s.user_id === userId).map((s) => structuredClone(s));
  }

  listMaps(userId: string): KnowledgeMapRecord[] {
    return [...this.maps.values()].filter((m) => m.user_id === userId).map((m) => structuredClone(m));
  }

  listMonsters(userId: string): KnowledgeMonsterRecord[] {
    return [...this.monsters.values()].filter((m) => m.user_id === userId).map((m) => structuredClone(m));
  }

  listEsports(userId: string): KnowledgeEsportsRecord[] {
    return [...this.esports.values()].filter((e) => e.user_id === userId).map((e) => structuredClone(e));
  }

  listVersions(userId: string): KnowledgeVersionRecord[] {
    return this.versions.filter((v) => v.user_id === userId).map((v) => structuredClone(v));
  }

  exportSnapshot(): MemoryEngineSnapshot {
    return {
      sources: [...this.sources.values()],
      jobs: [...this.jobs.values()],
      logs: [...this.logs],
      items: [...this.items.values()],
      emblems: [...this.emblems.values()],
      spells: [...this.spells.values()],
      maps: [...this.maps.values()],
      monsters: [...this.monsters.values()],
      patchesExt: [...this.patchesExt.values()],
      strategies: [...this.strategies.values()],
      esports: [...this.esports.values()],
      versions: [...this.versions],
      ingestionHashes: [...this.ingestionHashes.values()],
      states: [...this.states.values()],
    };
  }

  importSnapshot(snapshot: Partial<MemoryEngineSnapshot>): void {
    this.sources.clear();
    this.jobs.clear();
    this.logs = [];
    this.items.clear();
    this.emblems.clear();
    this.spells.clear();
    this.maps.clear();
    this.monsters.clear();
    this.patchesExt.clear();
    this.strategies.clear();
    this.esports.clear();
    this.versions = [];
    this.ingestionHashes.clear();
    this.states.clear();
    for (const s of snapshot.sources ?? []) this.sources.set(s.id, s);
    for (const j of snapshot.jobs ?? []) this.jobs.set(j.id, j);
    this.logs = [...(snapshot.logs ?? [])];
    for (const i of snapshot.items ?? []) this.items.set(i.id, i);
    for (const e of snapshot.emblems ?? []) this.emblems.set(e.id, e);
    for (const s of snapshot.spells ?? []) this.spells.set(s.id, s);
    for (const m of snapshot.maps ?? []) this.maps.set(m.id, m);
    for (const m of snapshot.monsters ?? []) this.monsters.set(m.id, m);
    for (const p of snapshot.patchesExt ?? []) this.patchesExt.set(p.id, p);
    for (const s of snapshot.strategies ?? []) this.strategies.set(s.id, s);
    for (const e of snapshot.esports ?? []) this.esports.set(e.id, e);
    this.versions = [...(snapshot.versions ?? [])];
    for (const h of snapshot.ingestionHashes ?? []) {
      // user id reconstructed from first matching state when needed — store keyed by sha only for import
      this.ingestionHashes.set(`import:${h.content_sha256}`, h);
    }
    for (const st of snapshot.states ?? []) this.states.set(st.user_id, st);
  }

  private requireJob(jobId: string): KnowledgeSyncJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Knowledge sync job ${jobId} not found`);
    return job;
  }
}
