import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getObjectStorage } from '@/lib/storage';
import { getSceneMap } from '@/lib/projects/repository';

type RouteParams = {
  params: Promise<{ id: string; sceneId: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const { id, sceneId } = await params;
  await requireUser();
  const scenes = getSceneMap().get(id) ?? [];
  const scene = scenes.find((row) => row.id === sceneId);
  if (!scene?.assetStorageKey) {
    return NextResponse.json({ error: 'Scene video not found' }, { status: 404 });
  }

  const storage = getObjectStorage();
  const object = await storage.getObject(scene.assetStorageKey);
  if (!object) {
    return NextResponse.json({ error: 'Object missing' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(object.body), {
    status: 200,
    headers: {
      'Content-Type': object.contentType || 'video/mp4',
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
