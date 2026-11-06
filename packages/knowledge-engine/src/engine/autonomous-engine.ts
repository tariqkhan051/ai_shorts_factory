import {
  GAME_KNOWLEDGE_IMPORT_SCHEMA_VERSION,
  type GameKnowledgeImportPackageV1,
} from '@ai-shorts-factory/validation';
import {
  importGameKnowledgeAsDraft,
  type GameKnowledgeRepository,
} from '@ai-shorts-factory/database';
import type { KnowledgeExtractionProvider } from '../extraction/provider.js';
import { createDefaultExtractionProvider } from '../extraction/provider.js';
import { PoliteFetchClient } from '../http/fetch-client.js';
import { isUrlAllowedByRobots } from '../http/robots.js';
import { summarizePatchNotes } from '../parsers/patch-notes.js';
import { listCategoryMembers, parsePageHtml, wikiPageUrl } from '../sources/mediawiki.js';
import type { MemoryKnowledgeEngineStore } from '../store/memory-engine-store.js';
import type {
  ExtractedHero,
  IngestionRunResult,
  KnowledgeItemRecord,
  KnowledgePatchExtRecord,
  KnowledgeSyncJob,
  PatchSummary,
  ServerType,
} from '../types.js';
import { newId, nowIso, sha256, stripHtml, toSnakeKey } from '../util.js';

export type AutonomousEngineOptions = {
  store: MemoryKnowledgeEngineStore;
  knowledge: GameKnowledgeRepository;
  fetchClient?: PoliteFetchClient;
  extraction?: KnowledgeExtractionProvider;
  /** Cap heroes fetched per run (tests / free-tier friendliness). */
  heroLimit?: number;
  itemLimit?: number;
  /** When true, skip remote network and use provided fixtures. */
  offlineFixtures?: {
    heroes?: Array<{ title: string; html: string; url: string }>;
    patchHtml?: Array<{ title: string; html: string; url: string; serverType?: ServerType }>;
  };
};

const MLBB_GAME = {
  slug: 'mlbb',
  name: 'Mobile Legends: Bang Bang',
  description: '5v5 MOBA by Moonton — knowledge maintained by Autonomous Knowledge Engine',
  terminology: {
    lord: 'Lord',
    turtle: 'Turtle',
    tower: 'Turret',
  },
  gameplay_rules:
    'Two teams of five destroy the enemy base. Objectives include Turtle, Lord, and turrets. Original and Advance Server knowledge are maintained separately.',
} as const;

/**
 * Autonomous MLBB Knowledge Engine.
 * Discovers sources, ingests via deterministic parsers, imports draft patches into Game KB,
 * and maintains extended catalogs with Original/Advance isolation.
 */
export class AutonomousMlbbKnowledgeEngine {
  private readonly store: MemoryKnowledgeEngineStore;
  private readonly knowledge: GameKnowledgeRepository;
  private readonly client: PoliteFetchClient;
  private readonly extraction: KnowledgeExtractionProvider;
  private readonly heroLimit: number;
  private readonly itemLimit: number;
  private readonly offlineFixtures: AutonomousEngineOptions['offlineFixtures'];

  constructor(options: AutonomousEngineOptions) {
    this.store = options.store;
    this.knowledge = options.knowledge;
    this.client = options.fetchClient ?? new PoliteFetchClient();
    this.extraction = options.extraction ?? createDefaultExtractionProvider();
    this.heroLimit = options.heroLimit ?? 40;
    this.itemLimit = options.itemLimit ?? 40;
    this.offlineFixtures = options.offlineFixtures;
  }

  activate(userId: string): ReturnType<MemoryKnowledgeEngineStore['setActivated']> {
    const state = this.store.setActivated(userId, true);
    // Queue initial ingestion automatically on activation.
    this.store.enqueueJob({
      userId,
      kind: 'initial_ingestion',
      idempotencyKey: `initial_ingestion:${userId}:v1`,
      inputJson: { reason: 'engine_activated' },
    });
    this.store.enqueueJob({
      userId,
      kind: 'patch_monitor',
      idempotencyKey: `patch_monitor:${userId}:${new Date().toISOString().slice(0, 13)}`,
      inputJson: { reason: 'schedule_seed' },
    });
    return state;
  }

  async runDueJobs(userId: string, lockOwner = 'knowledge-engine'): Promise<IngestionRunResult[]> {
    const state = this.store.getState(userId);
    if (!state.activated || !state.scheduler_config.enabled) {
      return [];
    }
    const results: IngestionRunResult[] = [];
    for (let i = 0; i < 3; i += 1) {
      const job = this.store.claimJob(userId, lockOwner, state.scheduler_config.lock_ttl_seconds);
      if (!job) break;
      results.push(await this.executeJob(job));
    }
    this.store.touchSync(userId, state.scheduler_config.patch_monitor_hours);
    this.scheduleRecurring(userId);
    return results;
  }

  async syncNow(userId: string, kind: KnowledgeSyncJob['kind'] = 'manual_sync'): Promise<IngestionRunResult> {
    this.store.setActivated(userId, true);
    const job = this.store.enqueueJob({
      userId,
      kind,
      idempotencyKey: `${kind}:${userId}:${Date.now()}`,
      inputJson: { reason: 'manual' },
    });
    // Force-run this specific job (do not claim an unrelated queued scheduler job).
    const locked: KnowledgeSyncJob = {
      ...job,
      status: 'running',
      lock_owner: `manual:${process.pid}`,
      lock_expires_at: new Date(Date.now() + 900_000).toISOString(),
      started_at: nowIso(),
      attempt: job.attempt + 1,
      updated_at: nowIso(),
    };
    // Re-enter through store completion paths by executing directly.
    return this.executeJob(locked);
  }

  async retryFailed(userId: string): Promise<IngestionRunResult[]> {
    const failed = this.store.listJobs(userId).filter((j) => j.status === 'failed');
    const results: IngestionRunResult[] = [];
    for (const job of failed.slice(0, 5)) {
      const retry = this.store.enqueueJob({
        userId,
        kind: 'retry_failed',
        idempotencyKey: `retry:${job.id}:${job.attempt}`,
        inputJson: { failed_job_id: job.id, original_kind: job.kind },
      });
      const claimed = this.store.claimJob(userId, `retry:${process.pid}`, 900);
      results.push(await this.executeJob(claimed ?? retry));
    }
    return results;
  }

  getDashboard(userId: string) {
    const state = this.store.getState(userId);
    const jobs = this.store.listJobs(userId);
    const sources = this.store.listSources(userId);
    const failed = jobs.filter((j) => j.status === 'failed');
    return {
      state,
      stats: state.stats_json,
      sources,
      recent_jobs: jobs.slice(0, 20),
      failed_jobs: failed.slice(0, 20),
      recent_logs: this.store.listLogs(userId).slice(-50),
      patches: this.store.listPatchesExt(userId),
      items: this.store.listItems(userId),
      versions: this.store.listVersions(userId).slice(-50),
    };
  }

  private scheduleRecurring(userId: string): void {
    const state = this.store.getState(userId);
    const cfg = state.scheduler_config;
    const hourBucket = (hours: number) => {
      const d = new Date();
      d.setMinutes(0, 0, 0);
      // bucket by interval
      const bucket = Math.floor(d.getTime() / (hours * 3600_000));
      return String(bucket);
    };
    this.store.enqueueJob({
      userId,
      kind: 'patch_monitor',
      idempotencyKey: `patch_monitor:${userId}:${hourBucket(cfg.patch_monitor_hours)}`,
    });
    this.store.enqueueJob({
      userId,
      kind: 'official_verify',
      idempotencyKey: `official_verify:${userId}:${hourBucket(cfg.official_verify_hours)}`,
    });
    this.store.enqueueJob({
      userId,
      kind: 'community_meta_refresh',
      idempotencyKey: `community_meta:${userId}:${hourBucket(cfg.community_meta_refresh_hours)}`,
    });
    this.store.enqueueJob({
      userId,
      kind: 'consistency_audit',
      idempotencyKey: `consistency:${userId}:${hourBucket(cfg.consistency_audit_hours)}`,
    });
  }

  private async executeJob(job: KnowledgeSyncJob): Promise<IngestionRunResult> {
    const base: IngestionRunResult = {
      job_id: job.id,
      kind: job.kind,
      status: 'running',
      heroes_upserted: 0,
      items_upserted: 0,
      patches_detected: 0,
      duplicates_skipped: 0,
      validation_failures: 0,
      draft_patch_id: null,
      errors: [],
      limitations: [],
    };

    try {
      this.store.appendLog(job.id, job.user_id, 'info', `Starting ${job.kind}`);
      let result = base;

      switch (job.kind) {
        case 'initial_ingestion':
        case 'manual_sync':
        case 'community_meta_refresh':
        case 'retry_failed':
          result = await this.runHeroItemIngestion(job, base);
          break;
        case 'patch_monitor':
          result = await this.runPatchMonitor(job, base);
          break;
        case 'official_verify':
          result = await this.runOfficialDiscovery(job, base);
          break;
        case 'consistency_audit':
          result = await this.runConsistencyAudit(job, base);
          break;
        default:
          result.limitations.push(`Unhandled job kind ${job.kind}`);
      }

      result.status = 'succeeded';
      this.store.completeJob(job.id, result as unknown as Record<string, unknown>);
      this.refreshStats(job.user_id);
      if (job.kind === 'initial_ingestion') {
        const state = this.store.getState(job.user_id);
        state.last_initial_ingestion_at = nowIso();
        this.store.setActivated(job.user_id, true);
      }
      this.store.appendLog(job.id, job.user_id, 'info', `Completed ${job.kind}`, {
        heroes: result.heroes_upserted,
        items: result.items_upserted,
        patches: result.patches_detected,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      base.status = 'failed';
      base.errors.push(message);
      this.store.failJob(job.id, message);
      this.store.appendLog(job.id, job.user_id, 'error', message);
      this.refreshStats(job.user_id);
      return base;
    }
  }

  private async runHeroItemIngestion(
    job: KnowledgeSyncJob,
    base: IngestionRunResult,
  ): Promise<IngestionRunResult> {
    const limitations: string[] = [];
    const heroes = await this.collectHeroes(job.user_id, limitations);
    const items = await this.collectItems(job.user_id, limitations);

    const serverType: ServerType = 'original';
    const patchCode = `auto-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const pkg = this.buildImportPackage({
      serverType,
      patchCode,
      title: `Autonomous Original Server ingest ${patchCode}`,
      heroes,
      notes: 'Auto-ingested by Autonomous MLBB Knowledge Engine. Community-derived fields labeled in sources.',
    });

    const raw = JSON.stringify(pkg, null, 2);
    const contentSha = sha256(raw);
    if (this.store.hasIngestionHash(job.user_id, contentSha)) {
      base.duplicates_skipped += 1;
      base.limitations.push(...limitations, 'Identical ingest package already present');
      this.store.saveIngestionHash({
        userId: job.user_id,
        contentSha,
        sourceKey: 'fandom_heroes',
        serverType,
        status: 'skipped_duplicate',
      });
      return { ...base, limitations };
    }

    const imported = await importGameKnowledgeAsDraft(this.knowledge, job.user_id, raw);
    if (!imported.ok) {
      base.validation_failures += 1;
      base.errors.push(...imported.errors);
      throw new Error(`Draft import failed: ${imported.errors.join('; ')}`);
    }

    base.heroes_upserted = heroes.length;
    base.draft_patch_id = imported.result.draft_patch.id;
    this.store.updateStats(job.user_id, {
      heroes_discovered: heroes.length,
      heroes_synchronized: heroes.length,
      ...(serverType === 'original' ? { original_status: 'populated' } : { advance_status: 'populated' }),
    });
    this.store.saveIngestionHash({
      userId: job.user_id,
      contentSha,
      sourceKey: 'fandom_heroes',
      serverType,
      status: 'imported_draft',
      entityRef: imported.result.draft_patch.id,
    });

    const profile =
      (await this.knowledge.getProfileBySlug(job.user_id, 'mlbb')) ??
      (await this.knowledge.listProfiles(job.user_id))[0];
    if (profile) {
      for (const item of items) {
        const record: KnowledgeItemRecord = {
          id: newId(),
          user_id: job.user_id,
          game_profile_id: profile.id,
          server_type: serverType,
          patch_version: patchCode,
          item_key: item.item_key,
          name: item.name,
          category: item.category,
          cost: item.cost,
          attributes: item.attributes,
          passive_effects: item.passive_effects,
          active_effects: item.active_effects,
          combinations: [],
          source: 'community_wiki:fandom',
          source_url: item.source_url,
          source_published_at: null,
          first_discovered_at: nowIso(),
          last_verified_at: nowIso(),
          confidence_score: item.confidence_score,
          verification_status: 'community',
          record_version: 1,
          content_sha256: item.content_sha256,
          evidence_text: item.evidence_text,
          unknown_fields: item.unknown_fields,
        };
        if (this.store.hasIngestionHash(job.user_id, item.content_sha256)) {
          base.duplicates_skipped += 1;
          continue;
        }
        this.store.upsertItem(record);
        this.store.saveIngestionHash({
          userId: job.user_id,
          contentSha: item.content_sha256,
          sourceKey: 'fandom_items',
          serverType,
          status: 'upserted',
          entityRef: record.item_key,
        });
        base.items_upserted += 1;
      }

      await this.seedGameplayScaffold(job.user_id, profile.id, serverType, patchCode);
    }

    base.limitations = limitations;
    return base;
  }

  private async runPatchMonitor(
    job: KnowledgeSyncJob,
    base: IngestionRunResult,
  ): Promise<IngestionRunResult> {
    const limitations: string[] = [];
    const docs = await this.discoverPatchDocuments(job.user_id, limitations);
    const profile =
      (await this.knowledge.getProfileBySlug(job.user_id, 'mlbb')) ??
      (await this.knowledge.listProfiles(job.user_id))[0];

    for (const doc of docs) {
      const summary = summarizePatchNotes({
        title: doc.title,
        htmlOrText: doc.html,
        sourceUrl: doc.url,
        serverTypeHint: doc.serverType,
      });
      if (this.store.hasIngestionHash(job.user_id, summary.content_sha256)) {
        base.duplicates_skipped += 1;
        continue;
      }
      if (!profile) {
        limitations.push('No game profile yet — patch summary stored after hero ingest creates mlbb profile');
        continue;
      }
      const record = this.toPatchExtRecord(job.user_id, profile.id, summary);
      const saved = this.store.upsertPatchExt(record);
      this.maybeLinkAdvanceOriginal(job.user_id, saved);
      this.store.saveIngestionHash({
        userId: job.user_id,
        contentSha: summary.content_sha256,
        sourceKey: 'patch_monitor',
        serverType: summary.server_type,
        status: 'patch_upserted',
        entityRef: saved.id,
      });
      base.patches_detected += 1;

      // Also create a draft Game KB patch package summarizing changes (heroes empty if unknown).
      if (summary.new_heroes.length || summary.hero_buffs.length || summary.hero_nerfs.length) {
        const pkg = this.buildImportPackage({
          serverType: summary.server_type,
          patchCode: `patch-${summary.patch_identifier}`.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64),
          title: `${summary.server_type} patch ${summary.patch_identifier}`,
          heroes: [],
          notes: JSON.stringify({
            summary,
            engine: 'autonomous-patch-monitor',
          }),
        });
        const raw = JSON.stringify(pkg);
        const imported = await importGameKnowledgeAsDraft(this.knowledge, job.user_id, raw);
        if (imported.ok) {
          base.draft_patch_id = imported.result.draft_patch.id;
        } else {
          base.validation_failures += 1;
          this.store.appendLog(job.id, job.user_id, 'warn', 'Patch draft import failed', {
            errors: imported.errors,
          });
        }
      }
    }

    // Official site discovery attempt
    await this.probeOfficialSite(job.user_id, limitations);

    base.limitations = limitations;
    return base;
  }

  private async runOfficialDiscovery(
    job: KnowledgeSyncJob,
    base: IngestionRunResult,
  ): Promise<IngestionRunResult> {
    const limitations: string[] = [];
    await this.probeOfficialSite(job.user_id, limitations);
    base.limitations = limitations;
    base.status = 'succeeded';
    return base;
  }

  private async runConsistencyAudit(
    job: KnowledgeSyncJob,
    base: IngestionRunResult,
  ): Promise<IngestionRunResult> {
    const originals = this.store.listPatchesExt(job.user_id, 'original');
    const advances = this.store.listPatchesExt(job.user_id, 'advance');
    for (const advance of advances) {
      const match = originals.find((o) => o.patch_identifier === advance.patch_identifier);
      if (match) this.store.linkAdvanceToOriginal(advance.id, match.id);
    }
    // Ensure no advance experimental facts leaked into original import packages — enforced at import schema.
    this.store.appendLog(job.id, job.user_id, 'info', 'Consistency audit complete', {
      original_patches: originals.length,
      advance_patches: advances.length,
    });
    return base;
  }

  private maybeLinkAdvanceOriginal(userId: string, saved: KnowledgePatchExtRecord): void {
    if (saved.server_type === 'advance') {
      const original = this.store
        .listPatchesExt(userId, 'original')
        .find((p) => p.patch_identifier === saved.patch_identifier);
      if (original) this.store.linkAdvanceToOriginal(saved.id, original.id);
    } else {
      const advance = this.store
        .listPatchesExt(userId, 'advance')
        .find((p) => p.patch_identifier === saved.patch_identifier);
      if (advance) this.store.linkAdvanceToOriginal(advance.id, saved.id);
    }
  }

  private async collectHeroes(
    userId: string,
    limitations: string[],
  ): Promise<ExtractedHero[]> {
    if (this.offlineFixtures?.heroes?.length) {
      const out: ExtractedHero[] = [];
      for (const fixture of this.offlineFixtures.heroes.slice(0, this.heroLimit)) {
        out.push(
          await this.extraction.extractHeroFromHtml({
            title: fixture.title,
            html: fixture.html,
            sourceUrl: fixture.url,
          }),
        );
      }
      return out;
    }

    const source = this.store.listSources(userId).find((s) => s.source_key === 'fandom_heroes');
    if (!source?.enabled) {
      limitations.push('fandom_heroes source disabled');
      return [];
    }
    const api = String(source.metadata.api ?? 'https://mobile-legends.fandom.com/api.php');
    const category = String(source.metadata.category ?? 'Category:Heroes');
    try {
      const members = await listCategoryMembers(this.client, api, category, this.heroLimit);
      this.store.updateSourceCheck(userId, 'fandom_heroes', { success: true });
      const heroes: ExtractedHero[] = [];
      for (const member of members) {
        try {
          const page = await parsePageHtml(this.client, api, member.title);
          const url = wikiPageUrl(source.base_url, member.title);
          const hero = await this.extraction.extractHeroFromHtml({
            title: page.title,
            html: page.html,
            sourceUrl: url,
          });
          heroes.push(hero);
        } catch (err) {
          limitations.push(
            `Hero ${member.title} failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      if (heroes.length === 0) {
        limitations.push('No heroes extracted from Fandom — check network/rate limits');
      }
      return heroes;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.store.updateSourceCheck(userId, 'fandom_heroes', { error: message });
      limitations.push(`Fandom hero discovery failed: ${message}`);
      return [];
    }
  }

  private async collectItems(
    userId: string,
    limitations: string[],
  ): Promise<
    Array<{
      item_key: string;
      name: string;
      category: string;
      cost: number | null;
      attributes: Record<string, unknown>;
      passive_effects: string;
      active_effects: string;
      source_url: string;
      confidence_score: number;
      content_sha256: string;
      evidence_text: string;
      unknown_fields: string[];
    }>
  > {
    const source = this.store.listSources(userId).find((s) => s.source_key === 'fandom_items');
    if (!source?.enabled) {
      limitations.push('fandom_items source disabled');
      return [];
    }
    if (this.offlineFixtures) {
      return [];
    }
    const api = String(source.metadata.api ?? 'https://mobile-legends.fandom.com/api.php');
    const category = String(source.metadata.category ?? 'Category:Items');
    try {
      const members = await listCategoryMembers(this.client, api, category, this.itemLimit);
      this.store.updateSourceCheck(userId, 'fandom_items', { success: true });
      const items = [];
      for (const member of members) {
        try {
          const page = await parsePageHtml(this.client, api, member.title);
          const text = stripHtml(page.html).slice(0, 4000);
          const costMatch = text.match(/Price[^0-9]{0,12}(\d{2,5})/i);
          const contentSha = sha256(text.replace(/\s+/g, ' ').toLowerCase());
          items.push({
            item_key: toSnakeKey(member.title),
            name: member.title,
            category: 'unknown',
            cost: costMatch ? Number(costMatch[1]) : null,
            attributes: {},
            passive_effects: '',
            active_effects: '',
            source_url: wikiPageUrl(source.base_url, member.title),
            confidence_score: 0.45,
            content_sha256: contentSha,
            evidence_text: text.slice(0, 1500),
            unknown_fields: ['category', 'attributes', 'passive_effects', 'active_effects'].concat(
              costMatch ? [] : ['cost'],
            ),
          });
        } catch (err) {
          limitations.push(
            `Item ${member.title} failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      return items;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.store.updateSourceCheck(userId, 'fandom_items', { error: message });
      limitations.push(`Fandom item discovery failed: ${message}`);
      return [];
    }
  }

  private async discoverPatchDocuments(
    userId: string,
    limitations: string[],
  ): Promise<Array<{ title: string; html: string; url: string; serverType?: ServerType }>> {
    if (this.offlineFixtures?.patchHtml?.length) {
      return this.offlineFixtures.patchHtml.map((p) => ({
        title: p.title,
        html: p.html,
        url: p.url,
        serverType: p.serverType,
      }));
    }

    const docs: Array<{ title: string; html: string; url: string; serverType?: ServerType }> = [];
    // Community: try Fandom patch notes category / known pages
    const fandomApi = 'https://mobile-legends.fandom.com/api.php';
    try {
      const categories = ['Category:Patches', 'Category:Patch_notes', 'Category:Updates'];
      for (const category of categories) {
        try {
          const members = await listCategoryMembers(this.client, fandomApi, category, 10);
          for (const member of members.slice(0, 5)) {
            const page = await parsePageHtml(this.client, fandomApi, member.title);
            docs.push({
              title: page.title,
              html: page.html,
              url: wikiPageUrl('https://mobile-legends.fandom.com/', member.title),
              serverType: /advance/i.test(member.title) ? 'advance' : 'original',
            });
          }
          if (members.length) break;
        } catch {
          // try next category
        }
      }
      if (!docs.length) {
        limitations.push(
          'No Fandom patch category members found — patch monitor relies on official page discovery + future feeds',
        );
      }
    } catch (err) {
      limitations.push(
        `Patch category discovery failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    void userId;
    return docs;
  }

  private async probeOfficialSite(userId: string, limitations: string[]): Promise<void> {
    const official = this.store.listSources(userId).find((s) => s.source_key === 'official_website');
    if (!official?.enabled) return;
    try {
      const robots = await isUrlAllowedByRobots(this.client, official.base_url);
      if (!robots.allowed) {
        limitations.push(`Official site blocked by robots.txt: ${robots.reason}`);
        this.store.updateSourceCheck(userId, 'official_website', { error: robots.reason });
        return;
      }
      const res = await this.client.get(official.base_url);
      if (!res.ok) {
        limitations.push(`Official site HTTP ${res.status}`);
        this.store.updateSourceCheck(userId, 'official_website', {
          error: `HTTP ${res.status}`,
        });
        return;
      }
      this.store.updateSourceCheck(userId, 'official_website', { success: true });
      limitations.push(
        'Official www.mobilelegends.com is a SPA; hero/patch JSON APIs are undocumented and not assumed. Monitoring homepage HTML only until a documented public feed is available.',
      );
      // Persist a lightweight "discovered" hash of homepage text for change detection.
      const normalized = stripHtml(res.text).replace(/\s+/g, ' ').toLowerCase();
      const contentSha = sha256(normalized);
      if (!this.store.hasIngestionHash(userId, contentSha)) {
        this.store.saveIngestionHash({
          userId,
          contentSha,
          sourceKey: 'official_website',
          serverType: null,
          status: 'homepage_snapshot',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      limitations.push(`Official site probe failed: ${message}`);
      this.store.updateSourceCheck(userId, 'official_website', { error: message });
    }
  }

  private async seedGameplayScaffold(
    userId: string,
    gameProfileId: string,
    serverType: ServerType,
    patchVersion: string,
  ): Promise<void> {
    const now = nowIso();
    this.store.upsertMap({
      id: newId(),
      user_id: userId,
      game_profile_id: gameProfileId,
      server_type: serverType,
      patch_version: patchVersion,
      map_key: 'land_of_dawn',
      name: 'Land of Dawn',
      lanes: ['exp', 'mid', 'gold'],
      jungle_areas: ['buff_camps', 'turtle_pit', 'lord_pit'],
      objective_mechanics: {
        turtle: 'early objective',
        lord: 'late objective',
      },
      terminology: {
        lord: 'Lord',
        turtle: 'Turtle',
        turret: 'Turret',
      },
      source: 'community_wiki+engine_scaffold',
      source_url: 'https://mobile-legends.fandom.com/wiki/Land_of_Dawn',
      source_published_at: null,
      first_discovered_at: now,
      last_verified_at: now,
      confidence_score: 0.5,
      verification_status: 'community',
      record_version: 1,
      content_sha256: sha256(`land_of_dawn:${serverType}:${patchVersion}`),
      evidence_text: 'Scaffold from well-known public map terminology; detailed mechanics marked unknown where unverified.',
      unknown_fields: ['exact_objective_timers', 'spawn_windows'],
    });

    for (const monster of [
      { key: 'turtle', name: 'Turtle', kind: 'objective' },
      { key: 'lord', name: 'Lord', kind: 'objective' },
      { key: 'orange_buff', name: 'Orange Buff', kind: 'buff' },
      { key: 'purple_buff', name: 'Purple Buff', kind: 'buff' },
    ]) {
      this.store.upsertMonster({
        id: newId(),
        user_id: userId,
        game_profile_id: gameProfileId,
        server_type: serverType,
        patch_version: patchVersion,
        monster_key: monster.key,
        name: monster.name,
        monster_kind: monster.kind,
        mechanics: 'unknown',
        source: 'engine_scaffold',
        source_url: null,
        source_published_at: null,
        first_discovered_at: now,
        last_verified_at: now,
        confidence_score: 0.4,
        verification_status: 'unverified',
        record_version: 1,
        content_sha256: sha256(`${monster.key}:${serverType}:${patchVersion}`),
        evidence_text: '',
        unknown_fields: ['mechanics', 'spawn_timers', 'rewards'],
      });
    }
  }

  private buildImportPackage(input: {
    serverType: ServerType;
    patchCode: string;
    title: string;
    heroes: ExtractedHero[];
    notes: string;
  }): GameKnowledgeImportPackageV1 {
    return {
      schema_version: GAME_KNOWLEDGE_IMPORT_SCHEMA_VERSION,
      game: { ...MLBB_GAME },
      server_environment: input.serverType,
      patch: {
        patch_code: input.patchCode,
        title: input.title,
        effective_from: nowIso(),
        effective_to: null,
        notes: input.notes,
        previous_patch_code: null,
      },
      server_profile: {
        terminology: {},
        recognition_config: {
          hud_profile: input.serverType === 'original' ? 'original_v1' : 'advance_v1',
        },
        notes:
          input.serverType === 'advance'
            ? 'Advance Server knowledge — must never overwrite Original Server'
            : 'Original Server knowledge',
      },
      sources: [
        {
          source_type: 'community_wiki',
          title: 'MLBB Fandom Wiki (community-derived)',
          url: 'https://mobile-legends.fandom.com/',
          published_at: null,
          retrieved_at: nowIso(),
          checksum_sha256: null,
          notes: 'Labeled community-derived. Not an official Moonton feed.',
        },
        {
          source_type: 'official_website',
          title: 'Official Mobile Legends website (monitored)',
          url: 'https://www.mobilelegends.com/',
          published_at: null,
          retrieved_at: nowIso(),
          checksum_sha256: null,
          notes: 'Homepage monitored; undocumented APIs not used.',
        },
      ],
      heroes: input.heroes.map((hero) => ({
        hero_key: hero.hero_key,
        name: hero.name,
        aliases: hero.aliases,
        roles: hero.roles,
        lanes: hero.lanes,
        description: hero.description,
        passive: hero.passive,
        damage_types: hero.damage_types,
        cc_types: hero.cc_types,
        sound_signature_notes: '',
        revamp_notes: hero.release_info ? `Release: ${hero.release_info}` : '',
        abilities: hero.abilities.map((ability) => ({
          ability_key: ability.ability_key,
          slot: ability.slot,
          name: ability.name,
          description: ability.description,
          effects: ability.effects,
          damage_types: ability.damage_types,
          cc_types: ability.cc_types,
          experimental: input.serverType === 'advance' ? ability.experimental : false,
        })),
      })),
      research_meta: {
        researcher: 'autonomous-mlbb-knowledge-engine',
        research_date: nowIso(),
        notes: `Extraction provider: ${this.extraction.name}. Unknown fields preserved as empty/unknown.`,
      },
    };
  }

  private toPatchExtRecord(
    userId: string,
    gameProfileId: string,
    summary: PatchSummary,
  ): KnowledgePatchExtRecord {
    return {
      id: newId(),
      user_id: userId,
      game_profile_id: gameProfileId,
      game_patch_id: null,
      server_type: summary.server_type,
      patch_identifier: summary.patch_identifier,
      release_date: summary.release_date,
      summary_json: { strategic_implications: summary.strategic_implications },
      new_heroes: summary.new_heroes,
      hero_buffs: summary.hero_buffs,
      hero_nerfs: summary.hero_nerfs,
      item_changes: summary.item_changes,
      gameplay_changes: summary.gameplay_changes,
      strategic_implications: summary.strategic_implications,
      sources: summary.sources,
      content_sha256: summary.content_sha256,
      related_advance_patch_id: null,
      related_original_patch_id: null,
      first_discovered_at: nowIso(),
      last_verified_at: nowIso(),
      confidence_score: 0.55,
      verification_status: 'community',
      record_version: 1,
    };
  }

  private refreshStats(userId: string): void {
    const jobs = this.store.listJobs(userId);
    const failed = jobs.filter((j) => j.status === 'failed').length;
    const items = this.store.listItems(userId);
    const patches = this.store.listPatchesExt(userId);
    const originalPatches = patches.filter((p) => p.server_type === 'original').length;
    const advancePatches = patches.filter((p) => p.server_type === 'advance').length;
    this.store.updateStats(userId, {
      items: items.length,
      patches: patches.length,
      emblems: 0,
      battle_spells: this.store.listSpells(userId).length,
      strategies: this.store.listStrategies(userId).length,
      esports: this.store.listEsports(userId).length,
      failed_jobs: failed,
      original_status: originalPatches > 0 ? 'populated' : 'empty',
      advance_status: advancePatches > 0 ? 'populated' : 'empty',
      sources_monitored: this.store.listSources(userId).filter((s) => s.enabled).length,
      recently_discovered_changes: this.store.listVersions(userId).length,
    });
  }
}
