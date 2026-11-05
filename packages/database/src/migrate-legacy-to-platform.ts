import { dnaSnapshotFromProject, videoContextFromDna } from './dna-helpers.js';
import type { MemoryBrandRepository } from './memory-brand-repository.js';
import type { MemoryProjectDnaRepository } from './memory-project-dna-repository.js';
import type { MemoryProjectRepository } from './memory-project-repository.js';
import type { MemoryVideoRepository } from './memory-video-repository.js';
import type { VideoRecord } from './content-platform-types.js';

export type LegacyMigrationResult = {
  brandsCreated: number;
  projectsAssigned: number;
  dnaVersionsSeeded: number;
  videosCreated: number;
  skippedProjects: string[];
};

/**
 * In-memory / test migration: convert pre-platform projects into
 * Brand + DNA v1 + Video without discarding existing project data.
 *
 * Never invents mock↔real asset conversions; only creates domain rows.
 */
export async function migrateLegacyProjectsToContentPlatform(deps: {
  brands: MemoryBrandRepository;
  projects: MemoryProjectRepository;
  dna: MemoryProjectDnaRepository;
  videos: MemoryVideoRepository;
  userId: string;
}): Promise<LegacyMigrationResult> {
  const { brands, projects, dna, videos, userId } = deps;
  const result: LegacyMigrationResult = {
    brandsCreated: 0,
    projectsAssigned: 0,
    dnaVersionsSeeded: 0,
    videosCreated: 0,
    skippedProjects: [],
  };

  const beforeBrands = await brands.listByUser(userId);
  const personal = await brands.ensurePersonalBrand(userId);
  if (beforeBrands.length === 0) {
    result.brandsCreated = 1;
  }

  const projectList = await projects.listByUser(userId);
  for (const project of projectList) {
    if (!project.brand_id) {
      await projects.assignBrand(userId, project.id, personal.id);
      result.projectsAssigned += 1;
    }

    const existingDna = await dna.listVersions(userId, project.id);
    if (existingDna.length === 0) {
      const refreshed = await projects.getById(userId, project.id);
      if (!refreshed) {
        result.skippedProjects.push(project.id);
        continue;
      }
      await dna.seedInitial(userId, project.id, dnaSnapshotFromProject(refreshed));
      result.dnaVersionsSeeded += 1;
    }

    const existingVideos = await videos.listByProject(userId, project.id);
    if (existingVideos.length > 0) {
      continue;
    }

    const current = await dna.getCurrent(userId, project.id);
    if (!current) {
      result.skippedProjects.push(project.id);
      continue;
    }

    const concept =
      project.input?.idea?.trim() ||
      project.name ||
      'Migrated legacy project';

    await videos.create(
      userId,
      project.id,
      {
        concept,
        story_brief: project.input?.existing_story ?? '',
        special_instructions: [
          project.input?.additional_instructions,
          project.input?.character_reference_notes,
        ]
          .filter(Boolean)
          .join('\n\n'),
        title: project.name,
      },
      {
        project_dna_version: current.version,
        context_snapshot: videoContextFromDna(project.id, current.version, current.snapshot),
        captions_on_video: project.captions_on_video,
        title: project.name,
      },
    );

    // Restore workflow state from the legacy project onto the new video.
    const created = (await videos.listByProject(userId, project.id))[0];
    if (created && project.workflow_state !== 'IDEA_SUBMITTED') {
      await forceVideoWorkflowState(videos, created, project.workflow_state);
    }

    await projects.setLegacySingleVideo(userId, project.id, true);
    result.videosCreated += 1;
  }

  return result;
}

/**
 * Migration-only: set workflow without transition validation so historical
 * states are preserved exactly.
 */
async function forceVideoWorkflowState(
  videos: MemoryVideoRepository,
  video: VideoRecord,
  state: VideoRecord['workflow_state'],
): Promise<void> {
  const all = videos.exportAll();
  const next = all.map((v) =>
    v.id === video.id
      ? {
          ...v,
          workflow_state: state,
          updated_at: new Date().toISOString(),
        }
      : v,
  );
  videos.importAll(next);
}
