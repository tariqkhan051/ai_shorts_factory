import type {
  GameServerEnvironment,
  MatchCommentaryStyle,
  MatchStudioPatchResolution,
  MatchStudioStatus,
} from '@ai-shorts-factory/shared-types';
import type { MatchStudioCapabilityFlags } from '@ai-shorts-factory/validation';

export type MatchStudioRunRecord = {
  id: string;
  user_id: string;
  project_id: string;
  match_source_id: string | null;
  title: string;
  status: MatchStudioStatus;
  patch_resolution: MatchStudioPatchResolution;
  server_environment: GameServerEnvironment;
  game_profile_id: string;
  game_patch_id: string | null;
  last_error: string | null;
  capability_flags: MatchStudioCapabilityFlags;
  commentary_style: MatchCommentaryStyle;
  created_at: string;
  updated_at: string;
};

export type CreateMatchStudioRunRecordInput = {
  project_id: string;
  title: string;
  status?: MatchStudioStatus;
  patch_resolution: MatchStudioPatchResolution;
  server_environment: GameServerEnvironment;
  game_profile_id: string;
  game_patch_id: string | null;
  match_source_id?: string | null;
  capability_flags?: MatchStudioCapabilityFlags;
  commentary_style?: MatchCommentaryStyle;
};

export type UpdateMatchStudioRunInput = Partial<{
  match_source_id: string | null;
  status: MatchStudioStatus;
  patch_resolution: MatchStudioPatchResolution;
  game_patch_id: string | null;
  last_error: string | null;
  capability_flags: MatchStudioCapabilityFlags;
  commentary_style: MatchCommentaryStyle;
  title: string;
}>;

export interface MatchStudioRepository {
  createRun(userId: string, input: CreateMatchStudioRunRecordInput): Promise<MatchStudioRunRecord>;
  updateRun(
    userId: string,
    runId: string,
    input: UpdateMatchStudioRunInput,
  ): Promise<MatchStudioRunRecord>;
  getRun(userId: string, runId: string): Promise<MatchStudioRunRecord | null>;
  listRuns(userId: string): Promise<MatchStudioRunRecord[]>;
  getRunByProject(userId: string, projectId: string): Promise<MatchStudioRunRecord | null>;
}
