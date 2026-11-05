import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getN8nPublisher } from '@/lib/n8n/runtime';

export const dynamic = 'force-dynamic';

/** Operator-triggered manual retry of a failed outbound event. */
export async function POST(request: Request) {
  await requireUser();
  const body = (await request.json().catch(() => null)) as { eventId?: string } | null;
  if (!body?.eventId) {
    return NextResponse.json({ ok: false, error: 'eventId required' }, { status: 400 });
  }
  const record = await getN8nPublisher().retry(body.eventId);
  if (!record) {
    return NextResponse.json({ ok: false, error: 'Event not found' }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    delivery: {
      event_id: record.event.event_id,
      status: record.status,
      attempts: record.attempts,
      last_error: record.lastError,
    },
  });
}
