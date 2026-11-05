import type { CreateProjectPayload, CreateVideoPayload } from '@ai-shorts-factory/validation';
import { dnaSnapshotFromProject, videoContextFromDna } from './dna-helpers.js';
import type {
  BrandRecord,
  ProjectDnaVersionRecord,
  VideoRecord,
} from './content-platform-types.js';
import type { ProjectRecord } from './types.js';
import type { BrandRepository } from './content-platform-types.js';
import type { ProjectDnaRepository } from './content-platform-types.js';
import type { VideoRepository } from './content-platform-types.js';
import type { ProjectRepository } from './types.js';

export type CreateProjectPlatformResult = {
  brand: BrandRecord;
  project: ProjectRecord;
  dna: ProjectDnaVersionRecord;
  video: VideoRecord | null;
};

/**
 * Creates a Project with Brand association, initial DNA v1, and optional first Video.
 * Legacy path: `input.idea` present → Project + Video #1 (legacy_single_video).
 * New path: DNA-only project when no idea/concept provided.
 */
export async function createProjectWithPlatform(
  deps: {
    brands: BrandRepository;
    projects: ProjectRepository;
    dna: ProjectDnaRepository;
    videos: VideoRepository;
  },
  userId: string,
  input: CreateProjectPayload,
): Promise<CreateProjectPlatformResult> {
  const brand =
    input.brand_id != null
      ? ((await deps.brands.getById(userId, input.brand_id)) ??
        (await deps.brands.ensurePersonalBrand(userId)))
      : await deps.brands.ensurePersonalBrand(userId);

  const project = await deps.projects.create(userId, {
    ...input,
    brand_id: brand.id,
  });

  // Ensure brand_id persisted even if create ignored it on older shims.
  if (project.brand_id !== brand.id && deps.projects.assignBrand) {
    await deps.projects.assignBrand(userId, project.id, brand.id);
  }

  const withBrand = (await deps.projects.getById(userId, project.id)) ?? project;
  const dna = await deps.dna.seedInitial(
    userId,
    withBrand.id,
    dnaSnapshotFromProject(withBrand),
  );

  const concept =
    input.input?.idea?.trim() ||
    input.initial_video_concept?.trim() ||
    '';

  let video: VideoRecord | null = null;
  if (concept) {
    video = await deps.videos.create(
      userId,
      withBrand.id,
      {
        concept,
        story_brief: input.input?.existing_story ?? '',
        special_instructions: [
          input.input?.additional_instructions,
          input.input?.character_reference_notes,
        ]
          .filter(Boolean)
          .join('\n\n'),
        title: withBrand.name,
      },
      {
        project_dna_version: dna.version,
        context_snapshot: videoContextFromDna(withBrand.id, dna.version, dna.snapshot),
        captions_on_video: withBrand.captions_on_video,
        title: withBrand.name,
      },
    );
  }

  const finalProject = (await deps.projects.getById(userId, withBrand.id)) ?? withBrand;
  return { brand, project: finalProject, dna, video };
}

export async function createVideoInProject(
  deps: {
    projects: ProjectRepository;
    dna: ProjectDnaRepository;
    videos: VideoRepository;
  },
  userId: string,
  projectId: string,
  input: CreateVideoPayload,
): Promise<VideoRecord> {
  const project = await deps.projects.getById(userId, projectId);
  if (!project) throw new Error('Project not found');

  const current = await deps.dna.getCurrent(userId, projectId);
  if (!current) throw new Error('Project DNA not initialized');

  return deps.videos.create(userId, projectId, input, {
    project_dna_version: current.version,
    context_snapshot: videoContextFromDna(projectId, current.version, current.snapshot),
    captions_on_video: current.snapshot.production_defaults.captions_on_video,
  });
}
