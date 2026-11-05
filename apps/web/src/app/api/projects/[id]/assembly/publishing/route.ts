import { requireUser } from '@/lib/auth';
import {
  formatHashtags,
  formatPublishingPackText,
  slugifyFilename,
} from '@/lib/assembly/publishing-pack';
import { getAssemblyRecordStore } from '@/lib/assembly/runtime';
import { getProjectRepository, getStoryRepository } from '@/lib/projects/repository';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const user = await requireUser();
  const projects = await getProjectRepository();
  const stories = await getStoryRepository();

  const project = await projects.getById(user.id, id);
  if (!project) {
    return new Response('Project not found', { status: 404 });
  }

  const record = await getAssemblyRecordStore().getByProject(user.id, id);
  if (!record || record.status !== 'completed') {
    return new Response('Completed assembly required before downloading publishing details', {
      status: 404,
    });
  }

  const story = await stories.getByProject(user.id, id);
  const meta = story?.current_version?.screenplay?.publishing_metadata;
  if (!meta) {
    return new Response('Publishing metadata not found on screenplay', { status: 404 });
  }

  const format = new URL(request.url).searchParams.get('format') ?? 'txt';
  const stem = slugifyFilename(meta.title, `project-${id}`);

  if (format === 'json') {
    const body = JSON.stringify(
      {
        title: meta.title,
        description: meta.description,
        tags: meta.tags,
        hashtags: formatHashtags(meta.tags),
      },
      null,
      2,
    );
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${stem}-publishing.json"`,
      },
    });
  }

  const body = formatPublishingPackText({
    title: meta.title,
    description: meta.description,
    tags: meta.tags,
  });

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${stem}-publishing.txt"`,
    },
  });
}
