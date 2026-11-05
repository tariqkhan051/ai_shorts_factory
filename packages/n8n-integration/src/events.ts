import { z } from 'zod';

export const N8N_EVENT_SCHEMA_VERSION = 1 as const;

export const N8N_EVENT_TYPES = [
  'video.approved',
  'scene.package.ready',
  'scene.awaiting_manual_generation',
  'scene.uploaded',
  'scene.verification.completed',
  'scene.verification.failed',
  'scene.real_generated',
  'video.assembly.ready',
  'video.assembly.completed',
  'video.assembly.failed',
] as const;

export type N8nEventType = (typeof N8N_EVENT_TYPES)[number];

const statusInfoSchema = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]));

export const n8nEventEnvelopeSchema = z.object({
  event_id: z.string().uuid(),
  event_type: z.enum(N8N_EVENT_TYPES),
  occurred_at: z.string().datetime(),
  project_id: z.string().min(1),
  video_id: z.string().min(1),
  scene_id: z.string().min(1).nullable().optional(),
  idempotency_key: z.string().min(1),
  schema_version: z.literal(N8N_EVENT_SCHEMA_VERSION),
  correlation_id: z.string().min(1).optional(),
  status: statusInfoSchema.default({}),
});

export type N8nEventEnvelope = z.infer<typeof n8nEventEnvelopeSchema>;

export type CreateN8nEventInput = {
  eventType: N8nEventType;
  projectId: string;
  videoId: string;
  sceneId?: string | null;
  idempotencyKey: string;
  correlationId?: string;
  status?: Record<string, string | number | boolean | null>;
  occurredAt?: string;
  eventId?: string;
};

export function buildIdempotencyKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((part) => part !== null && part !== undefined && String(part).length > 0)
    .map(String)
    .join(':');
}
