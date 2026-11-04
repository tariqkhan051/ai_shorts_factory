import { NextResponse } from 'next/server';
import { getVapidPublicKey } from '@/lib/notifications/runtime';

export async function GET() {
  const publicKey = getVapidPublicKey();
  return NextResponse.json({
    configured: Boolean(publicKey),
    publicKey,
  });
}
