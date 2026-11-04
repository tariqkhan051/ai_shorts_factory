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
  characters?: Array<{
    name: string;
    description: string;
    visual_identity: string;
    clothing?: string;
    appearance_details?: string;
  }>;
};

/**
 * Builds a copyable ChatGPT production prompt.
 * Does not call any ChatGPT API.
 */
export function buildChatGptProductionPrompt(project: PromptProjectContext): string {
  const characterBlock =
    project.characters && project.characters.length > 0
      ? project.characters
          .map(
            (c, index) =>
              `${index + 1}. ${c.name}\n   Description: ${c.description}\n   Visual identity: ${c.visual_identity}\n   Clothing: ${c.clothing ?? 'n/a'}\n   Appearance: ${c.appearance_details ?? 'n/a'}`,
          )
          .join('\n')
      : project.character_reference_notes?.trim() || 'Invent consistent characters as needed.';

  return `You are a senior short-form video showrunner and Google Flow prompt engineer.

Produce a complete production screenplay for a vertical short video.

PROJECT
- Name: ${project.name}
- Category: ${project.category}
- Visual style: ${project.visual_style}
- Language: ${project.language}
- Target audience: ${project.target_audience || 'general'}

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
- Include text overlay recommendations (optional per scene; do not force captions everywhere)
- Include transition recommendations
- Include suggested publishing title and description

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
      "name": string,
      "description": string,
      "visual_identity": string,
      "clothing": string,
      "appearance_details": string
    }
  ],
  "scenes": [
    {
      "scene_number": 1,
      "title": string,
      "duration_seconds": number,
      "visual_description": string,
      "flow_prompt": string,
      "narration": string,
      "dialogue": string,
      "text_overlay": string,
      "transition_out": string
    }
  ],
  "ending": string,
  "publishing_metadata": {
    "title": string,
    "description": string,
    "tags": string[]
  }
}

Scenes array MUST contain exactly ${BUSINESS_DEFAULTS.sceneCount} objects with scene_number values 1 through ${BUSINESS_DEFAULTS.sceneCount} in order.`;
}
