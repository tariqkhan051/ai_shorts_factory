import { describe, expect, it, beforeEach } from 'vitest';
import { emptyProjectDnaSnapshot } from '@ai-shorts-factory/validation';
import { MemoryBrandRepository } from './memory-brand-repository.js';
import { MemoryProjectRepository } from './memory-project-repository.js';
import { MemoryProjectDnaRepository } from './memory-project-dna-repository.js';
import { MemoryVideoRepository } from './memory-video-repository.js';
import { MemorySocialAccountRepository } from './memory-social-account-repository.js';
import { MemoryDistributionRepository } from './memory-distribution-repository.js';
import { MemoryEnvironmentRepository } from './memory-environment-repository.js';
import {
  createProjectWithPlatform,
  createVideoInProject,
} from './content-platform-service.js';
import { migrateLegacyProjectsToContentPlatform } from './migrate-legacy-to-platform.js';
import { dnaSnapshotFromProject, videoContextFromDna } from './dna-helpers.js';

const userId = '11111111-1111-1111-1111-111111111111';

describe('content platform domain', () => {
  const brands = new MemoryBrandRepository();
  const projects = new MemoryProjectRepository();
  const dna = new MemoryProjectDnaRepository(projects);
  const videos = new MemoryVideoRepository(projects);
  const social = new MemorySocialAccountRepository(projects);
  const distributions = new MemoryDistributionRepository(videos, social);
  const environments = new MemoryEnvironmentRepository(projects);

  beforeEach(() => {
    brands.clear();
    projects.clear();
    dna.clear();
    videos.clear();
    social.clear();
    distributions.clear();
    environments.clear();
  });

  it('creates brand, project DNA v1, and first video from legacy idea input', async () => {
    const result = await createProjectWithPlatform(
      { brands, projects, dna, videos },
      userId,
      {
        name: 'MLBB Cinematic Universe',
        category: 'gaming',
        visual_style: 'realistic_cinematic',
        language: 'en',
        target_audience: 'MOBA fans',
        niche: 'MLBB cinematic storytelling',
        input: {
          idea: 'A warrior discovers betrayal',
          existing_story: '',
          additional_instructions: '',
          character_reference_notes: '',
        },
      },
    );

    expect(result.brand.name).toBe('Personal');
    expect(result.project.brand_id).toBe(result.brand.id);
    expect(result.project.dna_current_version).toBe(1);
    expect(result.project.legacy_single_video).toBe(true);
    expect(result.dna.version).toBe(1);
    expect(result.video?.concept).toBe('A warrior discovers betrayal');
    expect(result.video?.project_dna_version).toBe(1);
    expect(result.video?.context_snapshot.content_niche).toBe('MLBB cinematic storytelling');
  });

  it('supports multiple projects under one brand', async () => {
    const brand = await brands.create(userId, { name: 'Arena Studios' });
    const a = await createProjectWithPlatform(
      { brands, projects, dna, videos },
      userId,
      {
        name: 'Project A',
        category: 'cinematic',
        brand_id: brand.id,
        input: {
          idea: 'First series',
          existing_story: '',
          additional_instructions: '',
          character_reference_notes: '',
        },
      },
    );
    const b = await createProjectWithPlatform(
      { brands, projects, dna, videos },
      userId,
      {
        name: 'Project B',
        category: 'anime',
        brand_id: brand.id,
        input: {
          idea: 'Second series',
          existing_story: '',
          additional_instructions: '',
          character_reference_notes: '',
        },
      },
    );

    expect(a.project.brand_id).toBe(brand.id);
    expect(b.project.brand_id).toBe(brand.id);
    expect((await projects.listByUser(userId)).filter((p) => p.brand_id === brand.id)).toHaveLength(
      2,
    );
  });

  it('versions Project DNA without mutating existing video context', async () => {
    const created = await createProjectWithPlatform(
      { brands, projects, dna, videos },
      userId,
      {
        name: 'DNA Lab',
        category: 'other',
        input: {
          idea: 'Episode one',
          existing_story: '',
          additional_instructions: '',
          character_reference_notes: '',
        },
      },
    );

    const v1Context = structuredClone(created.video!.context_snapshot);

    const nextSnapshot = emptyProjectDnaSnapshot({
      identity: {
        name: 'DNA Lab',
        content_niche: 'updated niche',
        language: 'en',
        primary_content_category: 'other',
      },
      visual: { default_visual_style: 'anime' },
    });
    const v2 = await dna.publishVersion(userId, created.project.id, nextSnapshot, 'niche update');

    expect(v2.version).toBe(2);
    expect((await projects.getById(userId, created.project.id))?.dna_current_version).toBe(2);

    const videoAfter = await videos.getById(userId, created.video!.id);
    expect(videoAfter?.project_dna_version).toBe(1);
    expect(videoAfter?.context_snapshot).toEqual(v1Context);
  });

  it('inherits current DNA when creating a new video', async () => {
    const created = await createProjectWithPlatform(
      { brands, projects, dna, videos },
      userId,
      {
        name: 'Portfolio',
        category: 'cinematic',
        niche: 'original niche',
        input: {
          idea: 'The Last Stand',
          existing_story: '',
          additional_instructions: '',
          character_reference_notes: '',
        },
      },
    );

    await dna.publishVersion(
      userId,
      created.project.id,
      emptyProjectDnaSnapshot({
        identity: {
          name: 'Portfolio',
          content_niche: 'dark fantasy',
          language: 'en',
          primary_content_category: 'cinematic',
        },
      }),
      'v2',
    );

    const second = await createVideoInProject(
      { projects, dna, videos },
      userId,
      created.project.id,
      { concept: 'The Fallen Warrior' },
    );

    expect(second.project_dna_version).toBe(2);
    expect(second.context_snapshot.content_niche).toBe('dark fantasy');
    expect((await videos.listByProject(userId, created.project.id)).length).toBe(2);
    expect((await projects.getById(userId, created.project.id))?.legacy_single_video).toBe(false);
  });

  it('allows DNA refresh only before approval', async () => {
    const created = await createProjectWithPlatform(
      { brands, projects, dna, videos },
      userId,
      {
        name: 'Refreshable',
        category: 'other',
        input: {
          idea: 'Draft',
          existing_story: '',
          additional_instructions: '',
          character_reference_notes: '',
        },
      },
    );

    const v2 = await dna.publishVersion(
      userId,
      created.project.id,
      emptyProjectDnaSnapshot({
        identity: {
          name: 'Refreshable',
          content_niche: 'refreshed',
          language: 'en',
          primary_content_category: 'other',
        },
      }),
    );

    const refreshed = await videos.refreshInheritedDna(userId, created.video!.id, {
      project_dna_version: v2.version,
      context_snapshot: videoContextFromDna(created.project.id, v2.version, v2.snapshot),
    });
    expect(refreshed.project_dna_version).toBe(2);

    await videos.setWorkflowState(userId, created.video!.id, 'STORY_PROMPT_READY');
    // Force approved-like terminal for refresh guard (via import)
    const frozen = videos.exportAll().map((v) =>
      v.id === created.video!.id
        ? { ...v, approved_at: new Date().toISOString(), workflow_state: 'APPROVED' as const }
        : v,
    );
    videos.importAll(frozen);

    await expect(
      videos.refreshInheritedDna(userId, created.video!.id, {
        project_dna_version: v2.version,
        context_snapshot: videoContextFromDna(created.project.id, v2.version, v2.snapshot),
      }),
    ).rejects.toThrow(/approved or completed/i);
  });

  it('reuses environments across videos within a project', async () => {
    const created = await createProjectWithPlatform(
      { brands, projects, dna, videos },
      userId,
      {
        name: 'Env Project',
        category: 'cinematic',
        input: {
          idea: 'Vid 1',
          existing_story: '',
          additional_instructions: '',
          character_reference_notes: '',
        },
      },
    );

    const env = await environments.create(userId, created.project.id, {
      name: 'Shadow Citadel',
      kind: 'building',
      description: 'Dark fortress',
    });

    await createVideoInProject(
      { projects, dna, videos },
      userId,
      created.project.id,
      { concept: 'Vid 2' },
    );

    const listed = await environments.listByProject(userId, created.project.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe(env.id);
  });

  it('links multiple social destinations to a project and distributes one video', async () => {
    const created = await createProjectWithPlatform(
      { brands, projects, dna, videos },
      userId,
      {
        name: 'Distro',
        category: 'other',
        input: {
          idea: 'Publish me',
          existing_story: '',
          additional_instructions: '',
          character_reference_notes: '',
        },
      },
    );

    const yt = await social.create(userId, {
      platform: 'youtube',
      display_name: 'Arena Shorts',
      handle: '@arena',
      brand_id: created.brand.id,
    });
    const ig = await social.create(userId, {
      platform: 'instagram',
      display_name: 'Arena Reels',
      handle: '@arena.reels',
      brand_id: created.brand.id,
    });

    expect(yt.connection_status).toBe('registered');
    expect(yt.publishing_enabled).toBe(false);
    expect(yt.secret_ref).toBeNull();

    await social.linkToProject(userId, created.project.id, yt.id, true);
    await social.linkToProject(userId, created.project.id, ig.id, false);

    const linked = await social.listByProject(userId, created.project.id);
    expect(linked).toHaveLength(2);

    const d1 = await distributions.create(userId, created.video!.id, created.project.id, {
      social_account_id: yt.id,
      platform: 'youtube',
      caption: 'YouTube caption',
      hashtags: ['shorts'],
    });
    const d2 = await distributions.create(userId, created.video!.id, created.project.id, {
      social_account_id: ig.id,
      platform: 'instagram',
      caption: 'IG caption',
      hashtags: ['reels'],
    });

    expect(d1.platform).toBe('youtube');
    expect(d2.caption).toBe('IG caption');

    const confirmed = await distributions.update(userId, d1.id, {
      confirm_manual_publish: true,
      published_url: 'https://youtube.com/shorts/abc',
    });
    expect(confirmed.status).toBe('published_manual');
    expect(confirmed.published_url).toContain('youtube.com');
  });

  it('migrates legacy projects without discarding data or fabricating videos twice', async () => {
    const legacy = await projects.create(userId, {
      name: 'Legacy Echoes',
      category: 'cinematic',
      visual_style: 'realistic_cinematic',
      captions_on_video: true,
      input: {
        idea: 'Rainy neon chase',
        existing_story: 'Act 1 exists',
        additional_instructions: 'Keep noir',
        character_reference_notes: '',
      },
    });
    await projects.setWorkflowState(userId, legacy.id, 'STORY_PROMPT_READY');

    const first = await migrateLegacyProjectsToContentPlatform({
      brands,
      projects,
      dna,
      videos,
      userId,
    });
    expect(first.brandsCreated).toBe(1);
    expect(first.videosCreated).toBe(1);
    expect(first.dnaVersionsSeeded).toBe(1);

    const migrated = await projects.getById(userId, legacy.id);
    expect(migrated?.brand_id).toBeTruthy();
    expect(migrated?.dna_current_version).toBe(1);
    expect(migrated?.legacy_single_video).toBe(true);
    expect(migrated?.input?.idea).toBe('Rainy neon chase');

    const video = await videos.getLegacyVideoForProject(userId, legacy.id);
    expect(video?.concept).toBe('Rainy neon chase');
    expect(video?.captions_on_video).toBe(true);
    expect(video?.workflow_state).toBe('STORY_PROMPT_READY');
    expect(video?.context_snapshot.project_dna_version).toBe(1);

    const second = await migrateLegacyProjectsToContentPlatform({
      brands,
      projects,
      dna,
      videos,
      userId,
    });
    expect(second.videosCreated).toBe(0);
    expect(second.dnaVersionsSeeded).toBe(0);
    expect((await videos.listByProject(userId, legacy.id)).length).toBe(1);
  });

  it('builds DNA snapshot helpers from project surface fields', () => {
    const snapshot = dnaSnapshotFromProject({
      id: 'p1',
      user_id: userId,
      name: 'Helper',
      category: 'anime',
      visual_style: 'anime',
      language: 'en',
      target_audience: 'teens',
      workflow_state: 'IDEA_SUBMITTED',
      notes: 'note',
      captions_on_video: false,
      brand_id: null,
      niche: 'mecha',
      content_purpose: 'entertainment',
      universe_context: 'Year 3000',
      dna_current_version: 0,
      legacy_single_video: true,
      game_profile_id: null,
      game_server_environment: null,
      active_game_patch_id: null,
      created_at: '',
      updated_at: '',
      deleted_at: null,
      input: null,
    });
    expect(snapshot.identity.content_niche).toBe('mecha');
    expect(snapshot.visual.default_visual_style).toBe('anime');
  });
});
