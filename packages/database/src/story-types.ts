import type {
  ScreenplayV1,
  VisualIdentityStructuredV1,
} from '@ai-shorts-factory/validation';
import type { WorkflowState } from '@ai-shorts-factory/shared-types';

export type StoryRecord = {
  id: string;
  project_id: string;
  current_version_id: string | null;
  title: string;
  approved_at: string | null;
  /** Soft gate: operator confirmed character review before approve. */
  characters_reviewed_at: string | null;
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

export type CharacterVisualIdentity = VisualIdentityStructuredV1;

export type CharacterVersionRecord = {
  id: string;
  character_id: string;
  version_number: number;
  name: string;
  description: string;
  visual_identity: string;
  visual_identity_structured: CharacterVisualIdentity;
  clothing: string;
  appearance_details: string;
  role: string;
  age_range: string;
  continuity_rules: string;
  reference_image_prompt: string;
  voice_description: string;
  dialogue_style: string;
  created_at: string;
  created_by: string | null;
  note: string;
};

export type CharacterRecord = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  /** Flattened visual identity for display / Flow text hints. */
  visual_identity: string;
  visual_identity_structured: CharacterVisualIdentity;
  clothing: string;
  appearance_details: string;
  screenplay_character_id: string | null;
  role: string;
  age_range: string;
  continuity_rules: string;
  reference_image_prompt: string;
  voice_description: string;
  dialogue_style: string;
  /** When true, character appears in the reusable library. */
  in_library: boolean;
  primary_reference_asset_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateCharacterInput = {
  name: string;
  description: string;
  visual_identity?: string;
  visual_identity_structured?: Partial<CharacterVisualIdentity>;
  clothing?: string;
  appearance_details?: string;
  screenplay_character_id?: string | null;
  role?: string;
  age_range?: string;
  continuity_rules?: string;
  reference_image_prompt?: string;
  voice_description?: string;
  dialogue_style?: string;
  in_library?: boolean;
};

export type UpdateCharacterInput = Partial<CreateCharacterInput> & {
  primary_reference_asset_id?: string | null;
  version_note?: string;
};

export type ReferenceAssetRecord = {
  id: string;
  user_id: string;
  character_id: string | null;
  project_id: string | null;
  storage_key: string;
  content_type: string;
  byte_size: number;
  checksum_sha256: string | null;
  original_filename: string | null;
  is_primary: boolean;
  notes: string;
  created_at: string;
  removed_at: string | null;
};

export type CreateReferenceAssetInput = {
  characterId: string;
  projectId?: string | null;
  storageKey: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
  originalFilename: string;
  isPrimary?: boolean;
  notes?: string;
};

export type LibraryNameConflict = {
  screenplayCharacterId: string;
  screenplayName: string;
  libraryCharacter: CharacterRecord;
};

export type SyncCharactersResult = {
  created: CharacterRecord[];
  updated: CharacterRecord[];
  linked: CharacterRecord[];
  conflicts: LibraryNameConflict[];
  missingReferences: CharacterRecord[];
};

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
  /**
   * Persist a new screenplay version without clearing approval or changing workflow.
   * Used for operator prompt fixes during Flow generation.
   */
  patchCurrentScreenplayPreservingApproval(
    userId: string,
    projectId: string,
    screenplay: ScreenplayV1,
  ): Promise<StoryWithCurrentVersion>;
  approveStory(userId: string, projectId: string): Promise<StoryWithCurrentVersion>;
  markCharactersReviewed(
    userId: string,
    projectId: string,
  ): Promise<StoryWithCurrentVersion>;
}

export interface CharacterRepository {
  listByUser(userId: string): Promise<CharacterRecord[]>;
  listByProject(userId: string, projectId: string): Promise<CharacterRecord[]>;
  listLibrary(userId: string): Promise<CharacterRecord[]>;
  getById(userId: string, characterId: string): Promise<CharacterRecord | null>;
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
  saveToLibrary(userId: string, characterId: string): Promise<CharacterRecord>;
  reuseLibraryCharacter(
    userId: string,
    projectId: string,
    libraryCharacterId: string,
    screenplayCharacterId?: string,
  ): Promise<CharacterRecord>;
  listVersions(userId: string, characterId: string): Promise<CharacterVersionRecord[]>;
  listProjectIdsForCharacter(userId: string, characterId: string): Promise<string[]>;
}

export interface ReferenceAssetRepository {
  listByCharacter(userId: string, characterId: string): Promise<ReferenceAssetRecord[]>;
  getById(userId: string, assetId: string): Promise<ReferenceAssetRecord | null>;
  create(userId: string, input: CreateReferenceAssetInput): Promise<ReferenceAssetRecord>;
  setPrimary(userId: string, characterId: string, assetId: string): Promise<ReferenceAssetRecord>;
  remove(userId: string, assetId: string): Promise<void>;
}
