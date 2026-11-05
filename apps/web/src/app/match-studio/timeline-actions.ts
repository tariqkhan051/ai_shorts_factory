'use server';

import { revalidatePath } from 'next/cache';
import {
  addManualMatchEventSchema,
  correctMatchEventSchema,
} from '@ai-shorts-factory/validation';
import { requireUser } from '@/lib/auth';
import {
  getMatchStudioRepository,
  getMatchTimelineRepository,
} from '@/lib/match-studio/runtime';

export type TimelineActionState = {
  ok: boolean;
  message?: string;
  errors?: string[];
};

export async function listTimelinesForRunAction(runId: string) {
  const user = await requireUser();
  const run = await (await getMatchStudioRepository()).getRun(user.id, runId);
  if (!run?.match_source_id) return { run, timelines: [] };
  const timelines = await (await getMatchTimelineRepository()).listTimelinesForSource(
    user.id,
    run.match_source_id,
  );
  return { run, timelines };
}

export async function correctTimelineEventAction(
  runId: string,
  timelineId: string,
  _prev: TimelineActionState,
  formData: FormData,
): Promise<TimelineActionState> {
  try {
    const user = await requireUser();
    const payload = correctMatchEventSchema.parse({
      event_id: String(formData.get('event_id') ?? ''),
      event_type: String(formData.get('event_type') || '') || undefined,
      timestamp_seconds: formData.get('timestamp_seconds')
        ? Number(formData.get('timestamp_seconds'))
        : undefined,
      confidence: formData.get('confidence') ? Number(formData.get('confidence')) : undefined,
      rejected: formData.get('rejected') === 'on' || formData.get('rejected') === 'true',
      notes: String(formData.get('notes') ?? '') || undefined,
      participants: formData.get('participants_json')
        ? JSON.parse(String(formData.get('participants_json')))
        : undefined,
    });

    if (
      payload.timestamp_seconds !== undefined &&
      (payload.timestamp_seconds < 0 || Number.isNaN(payload.timestamp_seconds))
    ) {
      return { ok: false, message: 'Invalid timestamp' };
    }

    await (await getMatchTimelineRepository()).correctEvent(user.id, timelineId, payload);
    revalidatePath(`/match-studio/${runId}/timeline`);
    return { ok: true, message: 'Correction saved' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Correction failed',
    };
  }
}

export async function addManualTimelineEventAction(
  runId: string,
  timelineId: string,
  _prev: TimelineActionState,
  formData: FormData,
): Promise<TimelineActionState> {
  try {
    const user = await requireUser();
    const payload = addManualMatchEventSchema.parse({
      event_type: String(formData.get('event_type') ?? 'other'),
      timestamp_seconds: Number(formData.get('timestamp_seconds') ?? 0),
      confidence: formData.get('confidence') ? Number(formData.get('confidence')) : 1,
      notes: String(formData.get('notes') ?? ''),
      participants: formData.get('participants_json')
        ? JSON.parse(String(formData.get('participants_json')))
        : [],
    });
    if (payload.timestamp_seconds < 0 || Number.isNaN(payload.timestamp_seconds)) {
      return { ok: false, message: 'Invalid timestamp' };
    }
    await (await getMatchTimelineRepository()).addManualEvent(user.id, timelineId, payload);
    revalidatePath(`/match-studio/${runId}/timeline`);
    return { ok: true, message: 'Manual event added' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Add event failed',
    };
  }
}

export async function setTimelineStatusAction(
  runId: string,
  timelineId: string,
  status: 'approved' | 'corrected' | 'proposed' | 'draft',
): Promise<TimelineActionState> {
  try {
    const user = await requireUser();
    await (await getMatchTimelineRepository()).setStatus(user.id, timelineId, status);
    revalidatePath(`/match-studio/${runId}/timeline`);
    return { ok: true, message: `Timeline marked ${status}` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Status update failed',
    };
  }
}
