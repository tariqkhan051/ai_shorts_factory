import type {
  GameServerEnvironment,
  MatchTimelineStatus,
} from '@ai-shorts-factory/shared-types';
import type {
  AddManualMatchEventPayload,
  CorrectMatchEventPayload,
  EventDetectionConfig,
  MatchEventCandidate,
  MatchTimelineExport,
} from '@ai-shorts-factory/validation';

export type MatchTimelineRecord = {
  id: string;
  user_id: string;
  match_source_id: string;
  status: MatchTimelineStatus;
  detection_config: EventDetectionConfig;
  cache_key: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type MatchTimelineWithEvents = MatchTimelineRecord & {
  events: MatchEventCandidate[];
  server_environment: GameServerEnvironment;
  game_patch_id: string;
};

export interface MatchTimelineRepository {
  getTimeline(userId: string, timelineId: string): Promise<MatchTimelineWithEvents | null>;
  getTimelineByCacheKey(
    userId: string,
    matchSourceId: string,
    cacheKey: string,
  ): Promise<MatchTimelineWithEvents | null>;
  listTimelinesForSource(
    userId: string,
    matchSourceId: string,
  ): Promise<MatchTimelineWithEvents[]>;
  saveTimeline(userId: string, timeline: MatchTimelineWithEvents): Promise<MatchTimelineWithEvents>;
  correctEvent(
    userId: string,
    timelineId: string,
    input: CorrectMatchEventPayload,
  ): Promise<MatchTimelineWithEvents>;
  addManualEvent(
    userId: string,
    timelineId: string,
    input: AddManualMatchEventPayload,
  ): Promise<MatchTimelineWithEvents>;
  setStatus(
    userId: string,
    timelineId: string,
    status: MatchTimelineStatus,
  ): Promise<MatchTimelineWithEvents>;
  exportTimeline(userId: string, timelineId: string): Promise<MatchTimelineExport>;
}
