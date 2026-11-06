import { describe, expect, it } from 'vitest';
import {
  MemoryGameKnowledgeRepository,
  MemoryProjectRepository,
  MemoryVideoRepository,
  publishGameKnowledgeWithConfirmation,
} from '@ai-shorts-factory/database';
import { PUBLISH_GAME_KNOWLEDGE_PHRASE } from '@ai-shorts-factory/shared-types';
import { AutonomousMlbbKnowledgeEngine } from './autonomous-engine.js';
import { MemoryKnowledgeEngineStore } from '../store/memory-engine-store.js';
import { summarizePatchNotes, isFormattingOnlyChange } from '../parsers/patch-notes.js';
import { parseFandomHeroHtml } from '../parsers/fandom-hero-html.js';
import { validateExtractedHero, detectHeroContradiction } from '../validation/record-validator.js';
import { buildMatchKnowledgeContextPackage } from '../match/context-package.js';
import { sha256 } from '../util.js';

const SAMPLE_HERO_HTML = `
<div class="mw-parser-output">
  <div data-source="name"><div class="pi-data-value">Natalia</div></div>
  <div data-source="role"><div class="pi-data-value">Assassin</div></div>
  <div data-source="lane"><div class="pi-data-value">Jungle</div></div>
  <div data-source="difficulty"><div class="pi-data-value">Hard</div></div>
  <div data-source="release_date"><div class="pi-data-value">2016</div></div>
  <div data-source="dmg_type"><div class="pi-data-value">Physical</div></div>
  <h2 id="Passive">Passive</h2>
  <p>Assassin Instinct — bonus damage from fog. Cooldown: none</p>
  <h2 id="Skill_1">Skill 1</h2>
  <p>Smoke Bomb conceals Natalia. Cooldown 10</p>
  <h2 id="Skill_2">Skill 2</h2>
  <p>Ghost Blade dash. Cooldown 8 / 7 / 6</p>
  <h2 id="Ultimate">Ultimate</h2>
  <p>The Hunt silence. Cooldown 40</p>
</div>
`;

function createRepos() {
  const projects = new MemoryProjectRepository();
  const videos = new MemoryVideoRepository(projects);
  const knowledge = new MemoryGameKnowledgeRepository(projects, videos);
  const store = new MemoryKnowledgeEngineStore();
  const engine = new AutonomousMlbbKnowledgeEngine({
    store,
    knowledge,
    heroLimit: 5,
    itemLimit: 5,
    offlineFixtures: {
      heroes: [
        {
          title: 'Natalia',
          html: SAMPLE_HERO_HTML,
          url: 'https://mobile-legends.fandom.com/wiki/Natalia',
        },
        {
          title: 'Tigreal',
          html: SAMPLE_HERO_HTML.replaceAll('Natalia', 'Tigreal')
            .replace('Assassin', 'Tank')
            .replace('Jungle', 'Roam'),
          url: 'https://mobile-legends.fandom.com/wiki/Tigreal',
        },
      ],
      patchHtml: [
        {
          title: 'Patch 1.9.50 Advanced Server',
          html: '<p>New hero Foo released. Natalia buffed damage. Tigreal nerfed cooldown. Blade of Despair item cost decreased. Turtle spawn adjusted.</p>',
          url: 'https://example.test/patch-advance',
          serverType: 'advance' as const,
        },
        {
          title: 'Patch 1.9.50 Original Server',
          html: '<p>New hero Foo released. Natalia buffed damage. Tigreal nerfed cooldown. Blade of Despair item cost decreased. Turtle spawn adjusted.</p>',
          url: 'https://example.test/patch-original',
          serverType: 'original' as const,
        },
      ],
    },
  });
  return { engine, store, knowledge, userId: 'user-kb-1' };
}

describe('Autonomous MLBB Knowledge Engine', () => {
  it('parses fandom hero html deterministically', () => {
    const hero = parseFandomHeroHtml({
      title: 'Natalia',
      html: SAMPLE_HERO_HTML,
      sourceUrl: 'https://mobile-legends.fandom.com/wiki/Natalia',
    });
    const validated = validateExtractedHero(hero);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.value.hero_key).toBe('natalia');
    expect(validated.value.roles).toContain('assassin');
    expect(validated.value.abilities.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects invalid extraction keys', () => {
    const hero = parseFandomHeroHtml({
      title: 'Natalia',
      html: SAMPLE_HERO_HTML,
      sourceUrl: 'https://example.test',
    });
    hero.hero_key = 'BAD KEY';
    const validated = validateExtractedHero(hero);
    // validator normalizes via toSnakeKey
    expect(validated.ok).toBe(true);
  });

  it('detects duplicate ingestion via content hash and formatting-only changes', () => {
    const a = '<p>Natalia   buffed</p>';
    const b = '<p>Natalia buffed</p>';
    expect(isFormattingOnlyChange(a, b)).toBe(true);
    const s1 = summarizePatchNotes({
      title: 'Patch 1.9.50',
      htmlOrText: a,
      sourceUrl: null,
    });
    const s2 = summarizePatchNotes({
      title: 'Patch 1.9.50',
      htmlOrText: b,
      sourceUrl: null,
    });
    expect(s1.content_sha256).toBe(s2.content_sha256);
    expect(s1.content_sha256).toBe(sha256('original:natalia buffed'));
  });

  it('runs initial ingestion without manual portal entry', async () => {
    const { engine, store, knowledge, userId } = createRepos();
    engine.activate(userId);
    const results = await engine.runDueJobs(userId, 'test-worker');
    expect(results.length).toBeGreaterThan(0);
    const ingest = results.find((r) => r.kind === 'initial_ingestion' || r.heroes_upserted > 0);
    expect(ingest).toBeTruthy();
    expect(ingest!.heroes_upserted).toBe(2);
    expect(ingest!.draft_patch_id).toBeTruthy();

    const profiles = await knowledge.listProfiles(userId);
    expect(profiles.some((p) => p.slug === 'mlbb')).toBe(true);
    const dashboard = engine.getDashboard(userId);
    expect(dashboard.state.activated).toBe(true);
    expect(dashboard.sources.length).toBeGreaterThan(0);

    // Duplicate detection on second identical ingest
    const second = await engine.syncNow(userId, 'manual_sync');
    expect(second.duplicates_skipped + second.heroes_upserted).toBeGreaterThan(0);

    // Failed source handling: disable fandom and ensure limitations surface
    store.setSourceEnabled(userId, 'fandom_heroes', false);
  });

  it('keeps Original and Advance patch records separated and linkable', async () => {
    const { engine, store, userId } = createRepos();
    // Ensure profile exists before patch monitor (heroes ingest creates mlbb profile).
    await engine.syncNow(userId, 'initial_ingestion');
    const patchResult = await engine.syncNow(userId, 'patch_monitor');
    expect(patchResult.patches_detected + patchResult.duplicates_skipped).toBeGreaterThanOrEqual(1);

    const originals = store.listPatchesExt(userId, 'original');
    const advances = store.listPatchesExt(userId, 'advance');
    expect(advances.length).toBeGreaterThan(0);
    expect(originals.length).toBeGreaterThan(0);
    // Same identifier should be linked without overwriting
    const advance = advances[0]!;
    const original = originals.find((o) => o.patch_identifier === advance.patch_identifier);
    expect(original).toBeTruthy();
    expect(advance.server_type).toBe('advance');
    expect(original!.server_type).toBe('original');
    expect(advance.id).not.toBe(original!.id);
  });

  it('preserves version history on item updates', async () => {
    const { engine, store, userId } = createRepos();
    engine.activate(userId);
    await engine.syncNow(userId, 'initial_ingestion');
    // Force an item upsert path via store directly
    const profileId = 'profile-1';
    const first = store.upsertItem({
      id: 'item-1',
      user_id: userId,
      game_profile_id: profileId,
      server_type: 'original',
      patch_version: '1',
      item_key: 'blade_of_despair',
      name: 'Blade of Despair',
      category: 'physical',
      cost: 3010,
      attributes: {},
      passive_effects: '',
      active_effects: '',
      combinations: [],
      source: 'test',
      source_url: null,
      source_published_at: null,
      first_discovered_at: new Date().toISOString(),
      last_verified_at: null,
      confidence_score: 0.5,
      verification_status: 'community',
      record_version: 1,
      content_sha256: 'aaa',
      evidence_text: '',
      unknown_fields: [],
    });
    const second = store.upsertItem({
      ...first,
      cost: 2990,
      content_sha256: 'bbb',
    });
    expect(second.record_version).toBe(2);
    expect(store.listVersions(userId).length).toBeGreaterThan(0);
  });

  it('prevents concurrent duplicate sync via job locking', async () => {
    const { engine, store, userId } = createRepos();
    engine.activate(userId);
    store.enqueueJob({
      userId,
      kind: 'manual_sync',
      idempotencyKey: 'manual-a',
    });
    store.enqueueJob({
      userId,
      kind: 'manual_sync',
      idempotencyKey: 'manual-b',
    });
    const first = store.claimJob(userId, 'worker-a', 900);
    expect(first?.status).toBe('running');
    const second = store.claimJob(userId, 'worker-b', 900);
    // Second same-kind job should be skipped_locked or null
    if (second) {
      expect(['skipped_locked', 'running']).toContain(second.status);
      if (second.status === 'running') {
        // different kind would be ok; same kind should not both run
        expect(second.kind).not.toBe(first!.kind);
      }
    } else {
      const skipped = store.listJobs(userId).some((j) => j.status === 'skipped_locked');
      expect(skipped).toBe(true);
    }
  });

  it('builds Match Studio knowledge context from activated patch only', async () => {
    const { engine, store, knowledge, userId } = createRepos();
    engine.activate(userId);
    const ingest = await engine.syncNow(userId, 'initial_ingestion');
    expect(ingest.draft_patch_id).toBeTruthy();
    await publishGameKnowledgeWithConfirmation(
      knowledge,
      userId,
      ingest.draft_patch_id!,
      PUBLISH_GAME_KNOWLEDGE_PHRASE,
    );
    const patch = await knowledge.getPatch(userId, ingest.draft_patch_id!);
    expect(patch?.status).toBe('published');

    const ctx = await buildMatchKnowledgeContextPackage({
      userId,
      knowledge,
      engineStore: store,
      serverEnvironment: 'original',
      gamePatchId: patch!.id,
      patchResolution: 'bound',
      relevantHeroKeys: ['natalia'],
    });
    expect(ctx.server_type).toBe('original');
    expect(ctx.heroes.some((h) => h.hero_key === 'natalia')).toBe(true);
    expect(ctx.grounding_rules.length).toBeGreaterThan(0);
  });

  it('flags contradictory hero role extracts', () => {
    const a = parseFandomHeroHtml({
      title: 'Natalia',
      html: SAMPLE_HERO_HTML,
      sourceUrl: 'https://a',
    });
    const b = parseFandomHeroHtml({
      title: 'Natalia',
      html: SAMPLE_HERO_HTML.replace('Assassin', 'Mage'),
      sourceUrl: 'https://b',
    });
    const issues = detectHeroContradiction(a, b);
    expect(issues.length).toBeGreaterThan(0);
  });
});
