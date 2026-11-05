import { NextResponse } from 'next/server';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import { authenticateN8nBearer } from '@/lib/n8n/auth';
import { resolveVideoIdForProject } from '@/lib/n8n/emit';
import { getOrchestrationController } from '@/lib/n8n/runtime';
import { AppGenerationStore } from '@/lib/generation/app-generation-store';
import { evaluateAssemblyGate } from '@/lib/generation/assembly-gate';
import {
  getCharacterRepository,
  getProjectRepository,
  getStoryRepository,
  getVideoRepository,
} from '@/lib/projects/repository';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Authoritative project/video/scene status for n8n.
 * n8n must re-fetch this after callbacks — never trust workflow-local REAL_GENERATED claims.
 */
export async function GET(request: Request, context: RouteContext) {
  const auth = authenticateN8nBearer(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  }

  const { id: projectId } = await context.params;
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'userId query required' }, { status: 400 });
  }

  const projects = await getProjectRepository();
  const project = await projects.getById(userId, projectId);
  if (!project) {
    return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  const stories = await getStoryRepository();
  const characters = await getCharacterRepository();
  const store = new AppGenerationStore(projects, stories, characters);
  const snapshot = await store.getProjectSnapshot(userId, projectId);
  const videoId = await resolveVideoIdForProject(
    userId,
    projectId,
    url.searchParams.get('videoId'),
  );
  const videos = await getVideoRepository();
  const video = await videos.getById(userId, videoId).catch(() => null);
  const orchestration = await getOrchestrationController().getOrCreate(projectId, videoId);
  const gate = evaluateAssemblyGate(snapshot.scenes);

  return NextResponse.json({
    ok: true,
    project: {
      id: project.id,
      name: project.name,
      workflow_state: snapshot.workflowState,
      paused: snapshot.workflowState === 'PAUSED',
      cancelled: snapshot.workflowState === 'CANCELLED',
    },
    video: {
      id: videoId,
      title: video?.title ?? project.name,
      workflow_state: video?.workflow_state ?? snapshot.workflowState,
      approved_at: video?.approved_at ?? null,
    },
    scenes: snapshot.scenes
      .slice()
      .sort((a, b) => a.sceneNumber - b.sceneNumber)
      .map((scene) => ({
        id: scene.id,
        scene_number: scene.sceneNumber,
        title: scene.title,
        state: scene.state,
        asset_origin: scene.assetOrigin ?? null,
        asset_storage_key: scene.assetStorageKey ?? null,
        has_durable_asset: Boolean(scene.assetStorageKey && scene.assetChecksum),
        flow_package_path: `/projects/${projectId}/flow-package`,
      })),
    assembly_gate: {
      ok: gate.ok,
      mode: gate.ok ? gate.mode : null,
      message: gate.ok ? null : gate.message,
      required_scenes: BUSINESS_DEFAULTS.sceneCount,
      verified_real_scenes: snapshot.scenes.filter(
        (scene) =>
          (scene.state === 'REAL_GENERATED' || scene.state === 'READY_FOR_ASSEMBLY') &&
          scene.assetOrigin === 'REAL_GENERATED',
      ).length,
    },
    orchestration: {
      enabled: orchestration.enabled,
      status: orchestration.status,
      execution_id: orchestration.executionId,
      correlation_id: orchestration.correlationId,
      current_scene_id: orchestration.currentSceneId,
      current_scene_number: orchestration.currentSceneNumber,
      verified_scene_count: orchestration.verifiedSceneCount,
      last_successful_sync_at: orchestration.lastSuccessfulSyncAt,
      last_error: orchestration.lastError,
    },
    // Explicit: n8n must not invent generation outcomes.
    authority: 'ai_shorts_factory',
    flow_automation: false,
  });
}
