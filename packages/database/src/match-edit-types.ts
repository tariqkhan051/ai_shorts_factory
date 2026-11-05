import type { MatchEditStatus } from '@ai-shorts-factory/shared-types';
import type {
  MatchEditArtifact,
  MatchEditPlan,
  MatchEditRecord,
} from '@ai-shorts-factory/validation';

export type MatchEditStored = {
  id: string;
  user_id: string;
  plan: MatchEditPlan;
  status: MatchEditStatus;
  artifacts: MatchEditArtifact[];
  approved_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

export interface MatchEditRepository {
  savePlan(userId: string, plan: MatchEditPlan): Promise<MatchEditPlan>;
  getPlan(userId: string, planId: string): Promise<MatchEditPlan | null>;
  saveEdit(userId: string, edit: MatchEditStored): Promise<MatchEditStored>;
  getEdit(userId: string, editId: string): Promise<MatchEditStored | null>;
  listEditsForTimeline(userId: string, timelineId: string): Promise<MatchEditStored[]>;
  toExport(edit: MatchEditStored): MatchEditRecord;
}
