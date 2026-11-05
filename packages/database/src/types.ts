import type {
  ContentCategory,
  GameServerEnvironment,
  VisualStyle,
  WorkflowState,
} from '@ai-shorts-factory/shared-types';
import type { CreateProjectPayload, UpdateProjectPayload } from '@ai-shorts-factory/validation';

export type ProjectInputRecord = {
  id: string;
  project_id: string;
  idea: string;
  existing_story: string;
  additional_instructions: string;
  character_reference_notes: string;
  created_at: string;
  updated_at: string;
};

export type ProjectRecord = {
  id: string;
  user_id: string;
  name: string;
  category: ContentCategory;
  visual_style: VisualStyle;
  language: string;
  target_audience: string;
  workflow_state: WorkflowState;
  notes: string;
  /** Burn on-screen captions from screenplay text_overlay during final assembly. */
  captions_on_video: boolean;
  /** Primary Brand association (nullable during partial migration). */
  brand_id: string | null;
  niche: string;
  content_purpose: string;
  universe_context: string;
  /** Current Project DNA version number (immutable history stored separately). */
  dna_current_version: number;
  /**
   * True when this project was migrated from the pre-platform era (one video).
   * Production routes may auto-resolve the sole video for compatibility.
   */
  legacy_single_video: boolean;
  /** Optional game-intelligence binding (Milestone 1). */
  game_profile_id: string | null;
  game_server_environment: GameServerEnvironment | null;
  active_game_patch_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  input: ProjectInputRecord | null;
};

export type DashboardStats = {
  projectsInProgress: number;
  completedVideos: number;
  failedJobs: number;
  needsIntervention: number;
};

export type CreateProjectInput = CreateProjectPayload;
export type UpdateProjectInput = UpdateProjectPayload;

export interface ProjectRepository {
  listByUser(userId: string): Promise<ProjectRecord[]>;
  getById(userId: string, projectId: string): Promise<ProjectRecord | null>;
  create(userId: string, input: CreateProjectInput): Promise<ProjectRecord>;
  update(userId: string, projectId: string, input: UpdateProjectInput): Promise<ProjectRecord>;
  softDelete(userId: string, projectId: string): Promise<void>;
  getDashboardStats(userId: string): Promise<DashboardStats>;
  setWorkflowState(userId: string, projectId: string, state: WorkflowState): Promise<ProjectRecord>;
  /** Content-platform helpers (memory + supabase). */
  assignBrand?(userId: string, projectId: string, brandId: string): Promise<ProjectRecord>;
  setDnaVersion?(userId: string, projectId: string, version: number): Promise<ProjectRecord>;
  setLegacySingleVideo?(
    userId: string,
    projectId: string,
    value: boolean,
  ): Promise<ProjectRecord>;
  setGameKnowledgeBinding?(
    userId: string,
    projectId: string,
    binding: {
      game_profile_id: string | null;
      game_server_environment: GameServerEnvironment | null;
      active_game_patch_id: string | null;
    },
  ): Promise<ProjectRecord>;
}
