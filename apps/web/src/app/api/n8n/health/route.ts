import { NextResponse } from 'next/server';
import { getN8nPublisher } from '@/lib/n8n/runtime';

export const dynamic = 'force-dynamic';

/**
 * Public-ish health for operators. Never returns webhook secrets or API keys.
 */
export async function GET() {
  const status = await getN8nPublisher().getStatus();
  return NextResponse.json({
    ok: true,
    integration: status,
    flow_automation: false,
  });
}
