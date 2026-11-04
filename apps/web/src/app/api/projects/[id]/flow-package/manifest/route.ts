import { NextResponse } from 'next/server';
import { exportFlowGenerationManifest } from '@ai-shorts-factory/flow-adapter';
import { requireUser } from '@/lib/auth';
import { buildProjectFlowGenerationPackage } from '@/lib/generation/flow-package';
import { prepareScenesPromptReady } from '@/lib/generation/manual-import';
import {
  getCharacterRepository,
  getProjectRepository,
  getStoryRepository,
} from '@/lib/projects/repository';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  const user = await requireUser();
  const projects = await getProjectRepository();
  const stories = await getStoryRepository();
  const characters = await getCharacterRepository();

  const project = await projects.getById(user.id, projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const story = await stories.getByProject(user.id, projectId);
  const screenplay = story?.current_version?.screenplay;
  if (!story?.approved_at || !screenplay) {
    return NextResponse.json({ error: 'Approved screenplay required' }, { status: 400 });
  }

  const scenes = await prepareScenesPromptReady(user.id, projectId);
  const characterRows = await characters.listByProject(user.id, projectId);
  const pkg = buildProjectFlowGenerationPackage({
    projectId,
    projectName: project.name,
    screenplay,
    scenes,
    characters: characterRows,
  });

  const body = exportFlowGenerationManifest(pkg);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="flow-generation-package-${projectId}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
