import type { ContentCategory, VisualStyle, WorkflowState } from '@ai-shorts-factory/shared-types';
import type {
  CreateProjectPayload,
  UpdateProjectPayload,
} from '@ai-shorts-factory/validation';

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
}
