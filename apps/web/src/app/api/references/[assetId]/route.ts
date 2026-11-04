import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getObjectStorage } from '@/lib/storage';
import { getReferenceAssetRepository } from '@/lib/projects/repository';

type RouteParams = {
  params: Promise<{ assetId: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const { assetId } = await params;
  const user = await requireUser();
  const references = await getReferenceAssetRepository();
  const asset = await references.getById(user.id, assetId);
  if (!asset) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const storage = getObjectStorage();
  try {
    const signed = await storage.createSignedDownloadUrl(asset.storage_key, {
      expiresInSeconds: 60 * 30,
    });
    if (signed.startsWith('http://') || signed.startsWith('https://') || signed.startsWith('/')) {
      return NextResponse.redirect(signed);
    }
  } catch {
    // Fall through to inline body for memory/local providers without HTTP URLs.
  }

  const object = await storage.getObject(asset.storage_key);
  if (!object) {
    return NextResponse.json({ error: 'Object missing' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(object.body), {
    status: 200,
    headers: {
      'Content-Type': object.contentType || asset.content_type,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
