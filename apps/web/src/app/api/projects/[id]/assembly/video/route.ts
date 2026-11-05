import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { requireUser } from '@/lib/auth';
import { assemblyVideoPath } from '@/lib/assembly/file-assembly-store';
import { slugifyFilename } from '@/lib/assembly/publishing-pack';
import { getAssemblyRecordStore } from '@/lib/assembly/runtime';
import { getStoryRepository } from '@/lib/projects/repository';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const user = await requireUser();
  const record = await getAssemblyRecordStore().getByProject(user.id, id);
  if (!record || record.status !== 'completed' || !record.localPath) {
    return new Response('Assembly video not found', { status: 404 });
  }

  const path = record.localPath || assemblyVideoPath(id);
  if (!existsSync(path)) {
    return new Response('Assembly video file missing on disk', { status: 404 });
  }

  const stories = await getStoryRepository();
  const story = await stories.getByProject(user.id, id);
  const publishingTitle = story?.current_version?.screenplay?.publishing_metadata?.title;
  const filename = `${slugifyFilename(publishingTitle ?? '', `project-${id}-final`)}.mp4`;

  const stat = statSync(path);
  const download = new URL(request.url).searchParams.get('download') === '1';
  const nodeStream = createReadStream(path);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(stat.size),
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes',
      ...(download
        ? {
            'Content-Disposition': `attachment; filename="${filename}"`,
          }
        : {
            'Content-Disposition': `inline; filename="${filename}"`,
          }),
    },
  });
}
