import type {
  GameServerEnvironment,
  MatchCommentaryStyle,
} from '@ai-shorts-factory/shared-types';
import type { MatchCommentaryScript } from '@ai-shorts-factory/validation';

export type MatchCommentaryApprovalStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected';

export type MatchCommentaryScriptRecord = {
  id: string;
  user_id: string;
  match_studio_run_id: string | null;
  timeline_id: string;
  match_source_id: string;
  server_environment: GameServerEnvironment;
  game_patch_id: string | null;
  style: MatchCommentaryStyle;
  approval_status: MatchCommentaryApprovalStatus;
  script: MatchCommentaryScript;
  segments: unknown[];
  notes: string;
  created_at: string;
  updated_at: string;
};

export type SaveMatchCommentaryInput = {
  id?: string;
  match_studio_run_id?: string | null;
  timeline_id: string;
  match_source_id: string;
  server_environment: GameServerEnvironment;
  game_patch_id?: string | null;
  style: MatchCommentaryStyle;
  approval_status?: MatchCommentaryApprovalStatus;
  script: MatchCommentaryScript;
  segments?: unknown[];
  notes?: string;
};

export interface MatchCommentaryRepository {
  saveScript(
    userId: string,
    input: SaveMatchCommentaryInput,
  ): Promise<MatchCommentaryScriptRecord>;
  getScript(userId: string, scriptId: string): Promise<MatchCommentaryScriptRecord | null>;
  listForTimeline(
    userId: string,
    timelineId: string,
  ): Promise<MatchCommentaryScriptRecord[]>;
  listForRun(
    userId: string,
    runId: string,
  ): Promise<MatchCommentaryScriptRecord[]>;
}
