import {
  BUSINESS_DEFAULTS,
  type ContentCategory,
  type VisualStyle,
} from '@ai-shorts-factory/shared-types';
import { SCREENPLAY_SCHEMA_VERSION } from '@ai-shorts-factory/validation';

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
  characters?: Array<{
    name: string;
    description: string;
    visual_identity: string;
    clothing?: string;
    appearance_details?: string;
    role?: string;
    age_range?: string;
    continuity_rules?: string;
  }>;
};

/**
 * Builds a copyable ChatGPT production prompt.
 * Does not call any ChatGPT API.
 */
export function buildChatGptProductionPrompt(project: PromptProjectContext): string {
  const captionsOnVideo = Boolean(project.captions_on_video);
  const characterBlock =
    project.characters && project.characters.length > 0
      ? project.characters
          .map(
            (c, index) =>
              `${index + 1}. ${c.name}\n   Role: ${c.role ?? 'n/a'}\n   Age range: ${c.age_range ?? 'n/a'}\n   Description: ${c.description}\n   Visual identity: ${c.visual_identity}\n   Clothing: ${c.clothing ?? 'n/a'}\n   Appearance: ${c.appearance_details ?? 'n/a'}\n   Continuity: ${c.continuity_rules ?? 'n/a'}`,
          )
          .join('\n')
      : project.character_reference_notes?.trim() || 'Invent consistent characters as needed.';

  const captionConstraint = captionsOnVideo
    ? `- Captions are REQUIRED: every scene MUST include a non-empty "text_overlay" short caption (about 3–8 words) suitable for burning onto the final vertical video
- Captions must be readable on mobile, punchy, and scene-specific — never leave text_overlay empty
- Prefer on-screen caption wording over repeating long narration verbatim`
    : `- Include text overlay recommendations (optional per scene; do not force captions everywhere)`;

  const captionShapeNote = captionsOnVideo
    ? `      "text_overlay": string (REQUIRED non-empty caption for this scene),`
    : `      "text_overlay": string,`;

  return `You are a senior short-form video showrunner and Google Flow prompt engineer.

Produce a complete production screenplay for a vertical short video.

PROJECT
- Name: ${project.name}
- Category: ${project.category}
- Visual style: ${project.visual_style}
- Language: ${project.language}
- Target audience: ${project.target_audience || 'general'}
- Burn captions on final video: ${captionsOnVideo ? 'YES' : 'no'}

CREATIVE BRIEF
- Idea: ${project.idea}
- Existing story (optional): ${project.existing_story?.trim() || 'none'}
- Additional instructions: ${project.additional_instructions?.trim() || 'none'}

CHARACTERS / REFERENCES
${characterBlock}

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
- Every identifiable character (including animals when continuity matters) MUST appear in the characters array with a stable character_id
- Scenes MUST list character_ids for every character who appears
- Reuse the same character_id across scenes — never duplicate the same person
- Do NOT invent anonymous crowd extras as characters

OUTPUT FORMAT
Return ONLY valid JSON. No markdown fences. No commentary.
Use schema_version "${SCREENPLAY_SCHEMA_VERSION}".

JSON SHAPE
{
  "schema_version": "${SCREENPLAY_SCHEMA_VERSION}",
  "title": string,
  "category": "${project.category}",
  "visual_style": "${project.visual_style}",
  "story_summary": string,
  "hook": string,
  "characters": [
    {
      "character_id": "stable-slug-id",
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
      "character_ids": ["stable-slug-id"],
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
