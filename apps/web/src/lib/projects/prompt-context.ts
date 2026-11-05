import type { ProjectDnaSnapshot } from '@ai-shorts-factory/validation';
import type {
  CharacterRecord,
  EnvironmentRecord,
  ProjectRecord,
  VideoRecord,
} from '@ai-shorts-factory/database';
import type { PromptProjectContext } from '@ai-shorts-factory/chatgpt-import';

export function buildPromptContext(input: {
  project: ProjectRecord;
  dna?: ProjectDnaSnapshot | null;
  dnaVersion?: number;
  video?: VideoRecord | null;
  characters: CharacterRecord[];
  environments?: EnvironmentRecord[];
}): PromptProjectContext {
  const { project, dna, video, characters } = input;
  const identity = dna?.identity;
  const visual = dna?.visual;
  const storytelling = dna?.storytelling;
  const production = dna?.production_defaults;
  const prompts = dna?.prompt_instructions;

  return {
    project_id: project.id,
    project_dna_version: (input.dnaVersion ?? project.dna_current_version) || 1,
    name: identity?.name ?? project.name,
    category: identity?.primary_content_category ?? project.category,
    visual_style: visual?.default_visual_style ?? project.visual_style,
    language: identity?.language ?? project.language,
    target_audience: identity?.target_audience ?? project.target_audience,
    content_niche: identity?.content_niche ?? project.niche,
    universe_context: identity?.universe_context ?? project.universe_context,
    content_purpose: identity?.content_purpose ?? project.content_purpose,
    tone: storytelling?.tone,
    preferred_hooks: storytelling?.preferred_hooks,
    permanent_project_instructions: prompts?.permanent_project_instructions,
    screenplay_generation_instructions: prompts?.screenplay_generation_instructions,
    character_continuity_instructions: prompts?.character_continuity_instructions,
    negative_prompt_rules: prompts?.negative_prompt_rules,
    aspect_ratio: production?.aspect_ratio,
    target_duration_seconds: production?.target_duration_seconds,
    captions_on_video:
      video?.captions_on_video ??
      production?.captions_on_video ??
      project.captions_on_video,
    video_title: video?.title,
    idea: video?.concept ?? project.input?.idea ?? '',
    existing_story: video?.story_brief ?? project.input?.existing_story,
    additional_instructions:
      video?.special_instructions ?? project.input?.additional_instructions,
    character_reference_notes: project.input?.character_reference_notes,
    library_characters: characters.map((character) => ({
      character_id: character.screenplay_character_id || character.id,
      name: character.name,
      description: character.description,
      visual_identity: character.visual_identity,
      clothing: character.clothing,
      appearance_details: character.appearance_details,
      role: character.role,
      age_range: character.age_range,
      continuity_rules: character.continuity_rules,
    })),
    library_environments: (input.environments ?? [])
      .filter((e) => e.active)
      .map((env) => ({
        environment_id: env.id,
        name: env.name,
        kind: env.kind,
        description: env.description,
        visual_identity: env.visual_identity,
        continuity_rules: env.continuity_rules,
      })),
  };
}
