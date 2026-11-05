import type { ProjectRecord } from './types.js';
import {
  emptyProjectDnaSnapshot,
  type ProjectDnaSnapshot,
} from '@ai-shorts-factory/validation';
import type { VideoContextSnapshot } from './content-platform-types.js';

/** Build DNA v1 snapshot from legacy / surface project fields. */
export function dnaSnapshotFromProject(project: ProjectRecord): ProjectDnaSnapshot {
  return emptyProjectDnaSnapshot({
    identity: {
      name: project.name,
      description: project.notes,
      brand_id: project.brand_id,
      content_niche: project.niche,
      target_audience: project.target_audience,
      language: project.language,
      primary_content_category: project.category,
      content_purpose: project.content_purpose,
      universe_context: project.universe_context,
    },
    visual: {
      default_visual_style: project.visual_style,
    },
    production_defaults: {
      captions_on_video: project.captions_on_video,
    },
  });
}

/** Compact inheritance snapshot stored on each video. */
export function videoContextFromDna(
  projectId: string,
  version: number,
  snapshot: ProjectDnaSnapshot,
): VideoContextSnapshot {
  return {
    project_id: projectId,
    project_dna_version: version,
    content_niche: snapshot.identity.content_niche,
    visual_style: snapshot.visual.default_visual_style,
    language: snapshot.identity.language,
    target_audience: snapshot.identity.target_audience,
    continuity_policy: 'reuse existing project characters',
    production_defaults: snapshot.production_defaults,
    prompt_instructions: snapshot.prompt_instructions,
  };
}
