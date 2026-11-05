import { describe, expect, it, beforeEach } from 'vitest';
import { PUBLISH_GAME_KNOWLEDGE_PHRASE } from '@ai-shorts-factory/shared-types';
import { MATCH_COMMENTARY_SCHEMA_VERSION } from '@ai-shorts-factory/validation';
import { publishGameKnowledgeWithConfirmation } from './game-knowledge-import.js';
import { MemoryGameKnowledgeRepository } from './memory-game-knowledge-repository.js';
import { MemoryMatchTimelineRepository } from './memory-match-timeline-repository.js';
import { MemoryProjectRepository } from './memory-project-repository.js';
import { MemoryVideoRepository } from './memory-video-repository.js';
import {
  attachAbilityMention,
  buildMatchCommentary,
} from './match-commentary-builder.js';
import { applyMatchCommentaryPolish } from './match-commentary-polish.js';
import { validateMatchCommentary } from './match-commentary-validate.js';
import { buildEventWindows } from './match-event-detect.js';
import type { MatchTimelineWithEvents } from './match-event-types.js';

const userId = '11111111-1111-1111-1111-111111111111';

describe('grounded match commentary (Milestone 5)', () => {
  const projects = new MemoryProjectRepository();
  const videos = new MemoryVideoRepository(projects);
  const knowledge = new MemoryGameKnowledgeRepository(projects, videos);
  const timelines = new MemoryMatchTimelineRepository();

  beforeEach(() => {
    projects.clear();
    videos.clear();
    knowledge.clear();
    timelines.clear();
  });

  async function seedOriginalWithExperimentalAdvanceAbility() {
    const profile = await knowledge.createProfile(userId, { slug: 'mlbb', name: 'MLBB' });
    const draft = await knowledge.createPatch(userId, profile.id, {
      server_environment: 'original',
      patch_code: '1.9.42',
      title: 'Original',
    });
    const natalia = await knowledge.upsertHero(userId, draft.id, {
      hero_key: 'natalia',
      name: 'Natalia',
    });
    await knowledge.upsertAbility(userId, natalia.id, {
      ability_key: 'smoke_bomb',
      slot: 'skill1',
      name: 'Smoke Bomb',
      experimental: false,
    });
    const tigreal = await knowledge.upsertHero(userId, draft.id, {
      hero_key: 'tigreal',
      name: 'Tigreal',
    });
    void tigreal;
    const published = await publishGameKnowledgeWithConfirmation(
      knowledge,
      userId,
      draft.id,
      PUBLISH_GAME_KNOWLEDGE_PHRASE,
    );

    // Separate Advance patch with experimental ability — must not leak into Original.
    const advanceDraft = await knowledge.createPatch(userId, profile.id, {
      server_environment: 'advance',
      patch_code: '1.9.42-exp',
      title: 'Advance',
    });
    const advanceNatalia = await knowledge.upsertHero(userId, advanceDraft.id, {
      hero_key: 'natalia',
      name: 'Natalia',
    });
    await knowledge.upsertAbility(userId, advanceNatalia.id, {
      ability_key: 'experimental_cloak',
      slot: 'ultimate',
      name: 'Experimental Cloak',
      experimental: true,
    });
    await publishGameKnowledgeWithConfirmation(
      knowledge,
      userId,
      advanceDraft.id,
      PUBLISH_GAME_KNOWLEDGE_PHRASE,
    );

    const activated = await knowledge.resolveActivatedKnowledge(userId, {
      server_environment: 'original',
      game_patch_id: published.id,
    });

    const killId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const turtleId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const timeline: MatchTimelineWithEvents = {
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      user_id: userId,
      match_source_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      status: 'proposed',
      detection_config: {
        pre_seconds: 3,
        main_seconds: 2,
        post_seconds: 3,
        sample_interval_seconds: 2,
        max_frames: 10,
        recognition: {
          hud_profile: 'test',
          sample_timestamps_seconds: [1],
          max_frames: 1,
          regions: [{ id: 'kill_feed', label: '', box: { x: 0.6, y: 0.1, w: 0.3, h: 0.2 } }],
        },
      },
      cache_key: 'test',
      notes: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      server_environment: 'original',
      game_patch_id: published.id,
      events: [
        {
          id: killId,
          event_type: 'kill',
          timestamp_seconds: 12,
          confidence: 0.9,
          participants: [
            { role: 'actor', hero_key: 'natalia', player_tag: 'ShadowFox', hero_name_raw: 'Natalia' },
            { role: 'target', hero_key: 'tigreal', player_tag: null, hero_name_raw: 'Tigreal' },
          ],
          evidence: [],
          windows: buildEventWindows({
            timestampSeconds: 12,
            preSeconds: 3,
            mainSeconds: 2,
            postSeconds: 3,
          }),
          notes: '',
          rejected: false,
          source: 'detector',
        },
        {
          id: turtleId,
          event_type: 'turtle',
          timestamp_seconds: 40,
          confidence: 0.85,
          participants: [],
          evidence: [],
          windows: buildEventWindows({
            timestampSeconds: 40,
            preSeconds: 3,
            mainSeconds: 2,
            postSeconds: 3,
          }),
          notes: '',
          rejected: false,
          source: 'detector',
        },
      ],
    };
    await timelines.saveTimeline(userId, timeline);

    return { published, activated, timeline, killId, turtleId };
  }

  it('builds commentary only from verified events and passes validation', async () => {
    const { activated, timeline } = await seedOriginalWithExperimentalAdvanceAbility();
    const result = buildMatchCommentary({
      matchSourceId: timeline.match_source_id,
      timeline,
      knowledge: activated,
      includeColorHook: true,
    });
    expect(result.validation.ok).toBe(true);
    expect(result.script.lines.some((line) => line.claim_type === 'kill')).toBe(true);
    expect(result.script.lines.some((line) => line.claim_type === 'turtle')).toBe(true);
    expect(result.script.lines.some((line) => line.claim_type === 'color' && !line.confirmed)).toBe(
      true,
    );
  });

  it('rejects unevidenced kill claims', async () => {
    const { activated, timeline } = await seedOriginalWithExperimentalAdvanceAbility();
    const { script } = buildMatchCommentary({
      matchSourceId: timeline.match_source_id,
      timeline,
      knowledge: activated,
    });
    script.lines.push({
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      event_id: null,
      claim_type: 'kill',
      text: 'Someone got a sneaky kill!',
      confirmed: true,
      hero_keys_mentioned: [],
      player_tags_mentioned: [],
      ability_keys_mentioned: [],
    });
    const validation = validateMatchCommentary({
      script,
      events: timeline.events,
      knowledge: activated,
    });
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.errors.some((e) => e.code === 'MISSING_EVENT_ID')).toBe(true);
  });

  it('keeps Advance experimental abilities out of Original activated knowledge', async () => {
    const { activated, timeline, killId } = await seedOriginalWithExperimentalAdvanceAbility();
    expect(
      activated.heroes.some((hero) =>
        hero.abilities.some((ability) => ability.ability_key === 'experimental_cloak'),
      ),
    ).toBe(false);

    const { script } = buildMatchCommentary({
      matchSourceId: timeline.match_source_id,
      timeline,
      knowledge: activated,
    });
    const killLine = script.lines.find((line) => line.event_id === killId)!;
    const attached = attachAbilityMention({
      script,
      lineId: killLine.id,
      abilityKey: 'experimental_cloak',
      knowledge: activated,
      events: timeline.events,
    });
    expect(attached.validation.ok).toBe(false);
    if (attached.validation.ok) return;
    expect(attached.validation.errors.some((e) => e.code === 'UNKNOWN_ABILITY')).toBe(true);

    // Even if an experimental ability is forced into the snapshot, Original validation rejects it.
    const leaked = {
      ...activated,
      heroes: activated.heroes.map((hero) =>
        hero.hero_key === 'natalia'
          ? {
              ...hero,
              abilities: [
                ...hero.abilities,
                {
                  id: '99999999-9999-9999-9999-999999999999',
                  hero_knowledge_id: hero.id,
                  ability_key: 'experimental_cloak',
                  slot: 'ultimate' as const,
                  name: 'Experimental Cloak',
                  description: '',
                  effects: '',
                  damage_types: [],
                  cc_types: [],
                  experimental: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
            }
          : hero,
      ),
    };
    const forced = attachAbilityMention({
      script,
      lineId: killLine.id,
      abilityKey: 'experimental_cloak',
      knowledge: leaked,
      events: timeline.events,
    });
    expect(forced.validation.ok).toBe(false);
    if (forced.validation.ok) return;
    expect(
      forced.validation.errors.some((e) => e.code === 'EXPERIMENTAL_ABILITY_ON_ORIGINAL'),
    ).toBe(true);

    const live = attachAbilityMention({
      script,
      lineId: killLine.id,
      abilityKey: 'smoke_bomb',
      knowledge: activated,
      events: timeline.events,
    });
    expect(live.validation.ok).toBe(true);
  });

  it('rejects polish packages that invent players or kills', async () => {
    const { activated, timeline } = await seedOriginalWithExperimentalAdvanceAbility();
    const { script } = buildMatchCommentary({
      matchSourceId: timeline.match_source_id,
      timeline,
      knowledge: activated,
    });

    const invented = {
      schema_version: MATCH_COMMENTARY_SCHEMA_VERSION,
      timeline_id: script.timeline_id,
      lines: [
        ...script.lines.map((line) => ({
          ...line,
          text: `${line.text}!!`,
        })),
        {
          id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
          event_id: null,
          claim_type: 'kill',
          text: 'FakePlayer deleted the whole squad!',
          confirmed: true,
          hero_keys_mentioned: [],
          player_tags_mentioned: ['FakePlayer'],
          ability_keys_mentioned: [],
        },
      ],
    };

    const result = applyMatchCommentaryPolish({
      base: script,
      polishedJson: JSON.stringify(invented),
      events: timeline.events,
      knowledge: activated,
    });
    expect(result.ok).toBe(false);

    const okPolish = applyMatchCommentaryPolish({
      base: script,
      polishedJson: JSON.stringify({
        schema_version: MATCH_COMMENTARY_SCHEMA_VERSION,
        timeline_id: script.timeline_id,
        lines: script.lines.map((line) => ({
          ...line,
          text: line.text.replace('!', ' — what a play!'),
        })),
      }),
      events: timeline.events,
      knowledge: activated,
    });
    expect(okPolish.ok).toBe(true);
  });
});
