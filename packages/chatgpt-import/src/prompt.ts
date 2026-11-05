import {
  BUSINESS_DEFAULTS,
  type ContentCategory,
  type VisualStyle,
} from '@ai-shorts-factory/shared-types';
import { SCREENPLAY_SCHEMA_VERSION } from '@ai-shorts-factory/validation';

export type PromptLibraryCharacter = {
  /** Stable project library ID — must be reused in screenplay output. */
  character_id: string;
  name: string;
  description: string;
  visual_identity: string;
  clothing?: string;
  appearance_details?: string;
  role?: string;
  age_range?: string;
  continuity_rules?: string;
};

export type PromptLibraryEnvironment = {
  environment_id: string;
  name: string;
  kind: string;
  description: string;
  visual_identity?: string;
  continuity_rules?: string;
};

export type PromptProjectContext = {
  name: string;
  category: ContentCategory;
  visual_style: VisualStyle;
  language: string;
  target_audience: string;
  idea: string;
  existing_story?: string;
  additional_instructions?: string;
  character_reference_notes?: string;
  /** When true, every scene must include a burnable on-screen caption in text_overlay. */
  captions_on_video?: boolean;
  /** @deprecated Prefer `library_characters` with stable IDs. */
  characters?: PromptLibraryCharacter[];
  /** Project-scoped library — reuse these IDs; do not reinvent. */
  library_characters?: PromptLibraryCharacter[];
  library_environments?: PromptLibraryEnvironment[];
  project_id?: string;
  project_dna_version?: number;
  content_niche?: string;
  universe_context?: string;
  content_purpose?: string;
  permanent_project_instructions?: string;
  screenplay_generation_instructions?: string;
  character_continuity_instructions?: string;
  negative_prompt_rules?: string;
  tone?: string;
  preferred_hooks?: string[];
  aspect_ratio?: string;
  target_duration_seconds?: number;
  video_title?: string;
};

/**
 * Builds a copyable ChatGPT production prompt.
 * Does not call any ChatGPT API.
 * Injects Project DNA + library catalogs so the operator never restates niche/lore/cast.
 */
export function buildChatGptProductionPrompt(project: PromptProjectContext): string {
  const captionsOnVideo = Boolean(project.captions_on_video);
  const libraryCharacters =
    project.library_characters ??
    project.characters?.map((c) => ({
      ...c,
      character_id: c.character_id || c.name,
    })) ??
    [];

  const characterBlock =
    libraryCharacters.length > 0
      ? libraryCharacters
          .map(
            (c, index) =>
              `${index + 1}. character_id="${c.character_id}" — ${c.name}\n   Role: ${c.role ?? 'n/a'}\n   Age range: ${c.age_range ?? 'n/a'}\n   Description: ${c.description}\n   Visual identity (LOCKED — do not rewrite): ${c.visual_identity}\n   Clothing: ${c.clothing ?? 'n/a'}\n   Appearance: ${c.appearance_details ?? 'n/a'}\n   Continuity: ${c.continuity_rules ?? 'n/a'}`,
          )
          .join('\n')
      : project.character_reference_notes?.trim() ||
        'No existing library characters. Propose new ones under proposed_new_characters only.';

  const environmentBlock =
    project.library_environments && project.library_environments.length > 0
      ? project.library_environments
          .map(
            (e, index) =>
              `${index + 1}. environment_id="${e.environment_id}" — ${e.name} (${e.kind})\n   Description: ${e.description}\n   Visual: ${e.visual_identity ?? 'n/a'}\n   Continuity: ${e.continuity_rules ?? 'n/a'}`,
          )
          .join('\n')
      : 'No existing environments. Propose new ones only when essential.';

  const captionConstraint = captionsOnVideo
    ? `- Captions are REQUIRED: every scene MUST include a non-empty "text_overlay" short caption (about 3–8 words) suitable for burning onto the final vertical video
- Captions must be readable on mobile, punchy, and scene-specific — never leave text_overlay empty
- Prefer on-screen caption wording over repeating long narration verbatim`
    : `- Include text overlay recommendations (optional per scene; do not force captions everywhere)`;

  const captionShapeNote = captionsOnVideo
    ? `      "text_overlay": string (REQUIRED non-empty caption for this scene),`
    : `      "text_overlay": string,`;

  const dnaBlock = [
    project.project_id ? `- Project ID: ${project.project_id}` : null,
    project.project_dna_version != null
      ? `- Project DNA version: ${project.project_dna_version}`
      : null,
    `- Name: ${project.name}`,
    project.content_niche ? `- Content niche: ${project.content_niche}` : null,
    `- Category: ${project.category}`,
    `- Visual style: ${project.visual_style}`,
    `- Language: ${project.language}`,
    `- Target audience: ${project.target_audience || 'general'}`,
    project.content_purpose ? `- Purpose: ${project.content_purpose}` : null,
    project.universe_context ? `- Universe / lore:\n${project.universe_context}` : null,
    project.tone ? `- Tone: ${project.tone}` : null,
    project.preferred_hooks?.length
      ? `- Preferred hooks: ${project.preferred_hooks.join('; ')}`
      : null,
    `- Aspect ratio: ${project.aspect_ratio ?? '9:16'}`,
    `- Target duration: ~${project.target_duration_seconds ?? 40}s (max ${BUSINESS_DEFAULTS.finalVideoMaxSeconds}s)`,
    `- Burn captions on final video: ${captionsOnVideo ? 'YES' : 'no'}`,
  ]
    .filter(Boolean)
    .join('\n');

  const instructionBlock = [
    project.permanent_project_instructions?.trim()
      ? `Permanent project instructions:\n${project.permanent_project_instructions.trim()}`
      : null,
    project.screenplay_generation_instructions?.trim()
      ? `Screenplay generation instructions:\n${project.screenplay_generation_instructions.trim()}`
      : null,
    project.character_continuity_instructions?.trim()
      ? `Character continuity:\n${project.character_continuity_instructions.trim()}`
      : null,
    project.negative_prompt_rules?.trim()
      ? `Avoid / negative rules:\n${project.negative_prompt_rules.trim()}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const videoTitleLine = project.video_title?.trim()
    ? `- Working title: ${project.video_title.trim()}`
    : null;

  return `You are a senior short-form video showrunner and Google Flow prompt engineer.

Produce a complete production screenplay for a vertical short video inside an existing content Project.
Do NOT restate or invent a new niche, lore, or visual system — follow Project DNA below.
Reuse existing library character_ids and environment_ids. Never duplicate an existing character under a new ID.

PROJECT DNA
${dnaBlock}

${instructionBlock ? `PROJECT INSTRUCTIONS\n${instructionBlock}\n` : ''}
THIS VIDEO
${videoTitleLine ? `${videoTitleLine}\n` : ''}- Concept / idea: ${project.idea}
- Story brief (optional): ${project.existing_story?.trim() || 'none'}
- Special instructions: ${project.additional_instructions?.trim() || 'none'}

EXISTING CHARACTER LIBRARY (reuse character_id values exactly)
${characterBlock}

EXISTING ENVIRONMENT LIBRARY (reuse environment_id values when applicable)
${environmentBlock}

HARD CONSTRAINTS
- Exactly ${BUSINESS_DEFAULTS.sceneCount} scenes
- Strong opening hook in scene 1
- Clear beginning, middle, and ending
- Consistent characters and visual continuity across all scenes
- Target total duration about 30–40 seconds, never over ${BUSINESS_DEFAULTS.finalVideoMaxSeconds} seconds
- Each scene should be suitable for about ${BUSINESS_DEFAULTS.defaultGenerationDurationSeconds} seconds of generation
- Include dialogue and/or narration where useful
- Include scene-specific Google Flow video prompts
${captionConstraint}
- Include transition recommendations
- Include suggested publishing title and description
- For EXISTING library characters: put them in character_usage with usage="existing"; copy their visual_identity unchanged into characters[]; NEVER rewrite locked visual identity
- For NEW characters only: list them in proposed_new_characters with temporary_id; do not invent permanent library IDs
- Scenes MUST list character_ids (existing stable IDs or temporary_ids) for every character who appears
- Continuity policy: reuse existing project characters
- Do NOT invent anonymous crowd extras as characters

OUTPUT FORMAT
Return ONLY valid JSON. No markdown fences. No commentary.
Use schema_version "${SCREENPLAY_SCHEMA_VERSION}".
Optional project_context / character_usage / proposed_new_characters fields are encouraged; the core screenplay shape remains required for import compatibility.

JSON SHAPE
{
  "schema_version": "${SCREENPLAY_SCHEMA_VERSION}",
  "project_context": {
    "project_id": "${project.project_id ?? 'unknown'}",
    "project_dna_version": ${project.project_dna_version ?? 1},
    "content_niche": "${project.content_niche ?? ''}",
    "visual_style": "${project.visual_style}",
    "continuity_policy": "reuse existing project characters"
  },
  "title": string,
  "category": "${project.category}",
  "visual_style": "${project.visual_style}",
  "story_summary": string,
  "hook": string,
  "character_usage": [
    { "character_id": "existing-library-id", "usage": "existing", "modification_requested": false }
  ],
  "proposed_new_characters": [
    {
      "temporary_id": "new_char_001",
      "name": string,
      "description": string,
      "visual_identity": { "face": string, "hair": string, "eyes": string, "skin": string, "clothing": string, "body": string, "distinctive_features": string, "accessories": string },
      "reference_image_prompt": string,
      "continuity_rules": string
    }
  ],
  "characters": [
    {
      "character_id": "stable-or-temporary-id",
      "name": string,
      "role": string,
      "age_range": string,
      "description": string,
      "visual_identity": {
        "face": string,
        "hair": string,
        "eyes": string,
        "skin": string,
        "clothing": string,
        "body": string,
        "distinctive_features": string,
        "accessories": string
      },
      "reference_image_prompt": string,
      "continuity_rules": string,
      "voice_description": string,
      "dialogue_style": string
    }
  ],
  "scenes": [
    {
      "scene_number": 1,
      "title": string,
      "duration_seconds": number,
      "visual_description": string,
      "flow_prompt": string,
      "character_ids": ["stable-or-temporary-id"],
      "environment_ids": [],
      "narration": string,
      "dialogue": string,
${captionShapeNote}
      "transition_out": string,
      "audio_direction": string,
      "camera_direction": string,
      "environment": string,
      "lighting": string
    }
  ],
  "ending": string,
  "publishing_metadata": {
    "title": string,
    "description": string,
    "tags": string[]
  }
}

Scenes array MUST contain exactly ${BUSINESS_DEFAULTS.sceneCount} objects with scene_number values 1 through ${BUSINESS_DEFAULTS.sceneCount} in order.
Every character_id listed in a scene MUST exist in the characters array.${
    captionsOnVideo
      ? `\nEvery scene's text_overlay MUST be a non-empty caption string that will be burned onto the final video.`
      : ''
  }`;
}
