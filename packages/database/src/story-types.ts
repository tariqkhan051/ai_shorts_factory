import type { ScreenplayV1 } from '@ai-shorts-factory/validation';
import type { WorkflowState } from '@ai-shorts-factory/shared-types';

export type StoryRecord = {
  id: string;
  project_id: string;
  current_version_id: string | null;
  title: string;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StoryVersionRecord = {
  id: string;
  story_id: string;
  schema_version: string;
  screenplay: ScreenplayV1;
  created_by: string | null;
  created_at: string;
};

export type StoryWithCurrentVersion = StoryRecord & {
  current_version: StoryVersionRecord | null;
};

export type CharacterRecord = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  visual_identity: string;
  clothing: string;
  appearance_details: string;
  created_at: string;
  updated_at: string;
};

export type CreateCharacterInput = {
  name: string;
  description: string;
  visual_identity: string;
  clothing?: string;
  appearance_details?: string;
};

export type UpdateCharacterInput = Partial<CreateCharacterInput>;

export interface StoryRepository {
  getByProject(userId: string, projectId: string): Promise<StoryWithCurrentVersion | null>;
  markPromptReady(userId: string, projectId: string): Promise<WorkflowState>;
  markWaitingForChatGpt(userId: string, projectId: string): Promise<WorkflowState>;
  importScreenplay(
    userId: string,
    projectId: string,
    screenplay: ScreenplayV1,
  ): Promise<StoryWithCurrentVersion>;
  saveEditedScreenplay(
    userId: string,
    projectId: string,
    screenplay: ScreenplayV1,
  ): Promise<StoryWithCurrentVersion>;
  approveStory(userId: string, projectId: string): Promise<StoryWithCurrentVersion>;
}

export interface CharacterRepository {
  listByUser(userId: string): Promise<CharacterRecord[]>;
  listByProject(userId: string, projectId: string): Promise<CharacterRecord[]>;
  create(userId: string, input: CreateCharacterInput): Promise<CharacterRecord>;
  update(
    userId: string,
    characterId: string,
    input: UpdateCharacterInput,
  ): Promise<CharacterRecord>;
  softDelete?(userId: string, characterId: string): Promise<void>;
  delete(userId: string, characterId: string): Promise<void>;
  linkToProject(userId: string, projectId: string, characterId: string): Promise<void>;
  unlinkFromProject(userId: string, projectId: string, characterId: string): Promise<void>;
}
