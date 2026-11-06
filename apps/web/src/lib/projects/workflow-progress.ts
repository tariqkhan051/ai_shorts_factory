import type { CharacterRecord, StoryWithCurrentVersion } from '@ai-shorts-factory/database';
import type { ProjectRecord } from '@ai-shorts-factory/database';
import type { GenerationSceneRecord } from '@ai-shorts-factory/workflow-engine';
import { evaluateAssemblyGate } from '@/lib/generation/assembly-gate';
import { charactersMissingReferences } from '@/lib/generation/flow-package';

export type WorkflowStageId =
  | 'story_imported'
  | 'characters_reviewed'
  | 'references_ready'
  | 'story_approved'
  | 'flow_package'
  | 'video_upload'
  | 'assembly';

export type WorkflowStage = {
  id: WorkflowStageId;
  label: string;
  status: 'complete' | 'current' | 'upcoming' | 'blocked';
  href: string;
  actionLabel: string;
  detail: string;
  available: boolean;
  blockedReason?: string;
};

export type ProjectDashboardStats = {
  storyStatus: string;
  characterCount: number;
  charactersMissingReferences: number;
  charactersReviewed: boolean;
  sceneCount: number;
  scenesByState: Record<string, number>;
  scenesReadyForFlow: number;
  scenesAwaitingUpload: number;
  verifiedRealScenes: number;
  assemblyReady: boolean;
  assemblyBlockedReason?: string;
  estimatedCredits?: number | 'unknown';
  confirmedCredits?: number | 'unknown';
  unknownCreditScenes: number;
  stages: WorkflowStage[];
  nextAction?: WorkflowStage;
};

export function buildProjectDashboard(input: {
  project: ProjectRecord;
  story: StoryWithCurrentVersion | null;
  characters: CharacterRecord[];
  scenes: GenerationSceneRecord[];
  estimatedCredits?: number | 'unknown';
  confirmedCredits?: number | 'unknown';
  unknownCreditScenes?: number;
}): ProjectDashboardStats {
  const { project, story, characters, scenes } = input;
  const screenplay = story?.current_version?.screenplay ?? null;
  const imported = Boolean(screenplay);
  const charactersReviewed = Boolean(story?.characters_reviewed_at);
  const missingRefs = charactersMissingReferences(characters);
  const referencesReady = characters.length > 0 && missingRefs.length === 0;
  const approved = Boolean(story?.approved_at);
  const scenesReadyForFlow = scenes.filter((scene) =>
    ['PROMPT_READY', 'AWAITING_MANUAL_GENERATION', 'PENDING'].includes(scene.state),
  ).length;
  const scenesAwaitingUpload = scenes.filter((scene) =>
    ['AWAITING_MANUAL_GENERATION', 'GENERATED_PENDING_UPLOAD', 'VERIFICATION_FAILED'].includes(
      scene.state,
    ),
  ).length;
  const verifiedRealScenes = scenes.filter(
    (scene) => scene.state === 'REAL_GENERATED' || scene.state === 'READY_FOR_ASSEMBLY',
  ).length;
  const gate = evaluateAssemblyGate(scenes);
  const assemblyBlockedReason = describeAssemblyBlocker({
    approved,
    verifiedRealScenes,
    gate,
  });

  const scenesByState: Record<string, number> = {};
  for (const scene of scenes) {
    scenesByState[scene.state] = (scenesByState[scene.state] ?? 0) + 1;
  }

  const base = `/projects/${project.id}`;
  const stages: WorkflowStage[] = [
    {
      id: 'story_imported',
      label: 'Story Imported',
      status: imported ? 'complete' : 'current',
      href: `${base}/story`,
      actionLabel: imported ? 'Review screenplay' : 'Import screenplay',
      detail: imported ? screenplay!.title : 'Paste ChatGPT JSON in Story Studio',
      available: true,
    },
    {
      id: 'characters_reviewed',
      label: 'Characters Reviewed',
      status: !imported
        ? 'upcoming'
        : charactersReviewed
          ? 'complete'
          : 'current',
      href: `${base}/characters`,
      actionLabel: 'Manage characters',
      detail: imported
        ? `${characters.length} character(s)${charactersReviewed ? ' · reviewed' : ' · review required'}`
        : 'Import a story first',
      available: imported,
      blockedReason: imported ? undefined : 'Import a screenplay before reviewing characters',
    },
    {
      id: 'references_ready',
      label: 'References Ready',
      status: !imported
        ? 'upcoming'
        : referencesReady
          ? 'complete'
          : charactersReviewed
            ? 'current'
            : 'upcoming',
      href: `${base}/characters`,
      actionLabel: 'Upload references',
      detail: imported
        ? missingRefs.length === 0
          ? 'All characters have primary reference images'
          : `${missingRefs.length} missing primary reference(s)`
        : 'Import a story first',
      available: imported,
      blockedReason: imported ? undefined : 'Import a screenplay first',
    },
    {
      id: 'story_approved',
      label: 'Story Approved',
      status: approved
        ? 'complete'
        : charactersReviewed && referencesReady
          ? 'current'
          : 'upcoming',
      href: `${base}/story`,
      actionLabel: 'Approve story',
      detail: approved
        ? `Approved ${story?.approved_at}`
        : !charactersReviewed
          ? 'Mark characters reviewed first'
          : !referencesReady
            ? 'Upload primary references first'
            : 'Ready to approve',
      available: imported && charactersReviewed && referencesReady && !approved,
      blockedReason: !imported
        ? 'Import a screenplay first'
        : !charactersReviewed
          ? 'Mark characters as reviewed before approval'
          : !referencesReady
            ? 'Upload primary references before approval'
            : approved
              ? 'Already approved'
              : undefined,
    },
    {
      id: 'flow_package',
      label: 'Flow Package',
      status: approved ? (scenes.length > 0 ? 'complete' : 'current') : 'blocked',
      href: `${base}/flow-package`,
      actionLabel: 'Open Flow Package',
      detail: approved
        ? `${scenes.length || 5} scene package for manual Google Flow`
        : 'Approve the story to unlock Flow Package',
      available: approved,
      blockedReason: approved ? undefined : 'Approve the story first',
    },
    {
      id: 'video_upload',
      label: 'Video Upload',
      status: !approved
        ? 'blocked'
        : verifiedRealScenes >= 5
          ? 'complete'
          : 'current',
      href: `${base}/flow-package`,
      actionLabel: 'Upload MP4s',
      detail: `${verifiedRealScenes}/5 verified real scenes · ${scenesAwaitingUpload} awaiting upload`,
      available: approved,
      blockedReason: approved ? undefined : 'Approve the story first',
    },
    {
      id: 'assembly',
      label: 'Assembly',
      status: !approved
        ? 'blocked'
        : gate.ok
          ? 'current'
          : verifiedRealScenes > 0
            ? 'current'
            : 'upcoming',
      href: gate.ok ? `${base}/assemble` : `${base}/flow-package`,
      actionLabel: gate.ok ? 'Assemble' : 'Upload MP4s first',
      detail: gate.ok
        ? gate.mode === 'real'
          ? 'Real assembly gate passed'
          : 'Mock assembly gate passed'
        : assemblyBlockedReason ?? 'Waiting for five verified REAL_GENERATED scenes',
      available: gate.ok,
      blockedReason: gate.ok ? undefined : assemblyBlockedReason,
    },
  ];

  // Mark first incomplete available stage as current when multiple could be.
  let sawCurrent = false;
  for (const stage of stages) {
    if (stage.status === 'complete') continue;
    if (!sawCurrent && (stage.status === 'current' || stage.available)) {
      stage.status = stage.available ? 'current' : stage.status;
      sawCurrent = true;
    } else if (stage.status === 'current' && sawCurrent) {
      stage.status = 'upcoming';
    }
  }

  const nextAction = stages.find((stage) => stage.status === 'current') ?? stages.find((s) => s.available);

  return {
    storyStatus: project.workflow_state,
    characterCount: characters.length,
    charactersMissingReferences: missingRefs.length,
    charactersReviewed,
    sceneCount: scenes.length,
    scenesByState,
    scenesReadyForFlow,
    scenesAwaitingUpload,
    verifiedRealScenes,
    assemblyReady: gate.ok,
    assemblyBlockedReason,
    estimatedCredits: input.estimatedCredits,
    confirmedCredits: input.confirmedCredits,
    unknownCreditScenes: input.unknownCreditScenes ?? 0,
    stages,
    nextAction,
  };
}

/** Which Story Studio panel to show for the current workflow stage. */
export type StoryStudioFocus =
  | 'prompt_and_import'
  | 'characters_review'
  | 'references'
  | 'approve'
  | 'done';

export function getStoryStudioFocus(dashboard: ProjectDashboardStats): StoryStudioFocus {
  switch (dashboard.nextAction?.id) {
    case undefined:
    case 'story_imported':
      return 'prompt_and_import';
    case 'characters_reviewed':
      return 'characters_review';
    case 'references_ready':
      return 'references';
    case 'story_approved':
      return 'approve';
    default:
      return 'done';
  }
}

/** Which Character Review panel to emphasize for the current workflow stage. */
export type CharacterStudioFocus = 'needs_import' | 'review' | 'references' | 'done';

export function getCharacterStudioFocus(dashboard: ProjectDashboardStats): CharacterStudioFocus {
  switch (dashboard.nextAction?.id) {
    case undefined:
    case 'story_imported':
      return 'needs_import';
    case 'characters_reviewed':
      return 'review';
    case 'references_ready':
      return 'references';
    default:
      return 'done';
  }
}

/** Operator-facing assembly status — avoid dumping raw mock-gate noise for PROMPT_READY scenes. */
function describeAssemblyBlocker(input: {
  approved: boolean;
  verifiedRealScenes: number;
  gate: ReturnType<typeof evaluateAssemblyGate>;
}): string | undefined {
  if (input.gate.ok) return undefined;
  if (!input.approved) return 'Approve the story first';

  const required = 5;
  if (input.verifiedRealScenes < required) {
    return `Upload and verify ${required} real Flow MP4s first (${input.verifiedRealScenes}/${required} ready). Prompt-ready scenes are not assembly assets.`;
  }

  // Real clips exist but gate still fails (verification/mixed mode) — surface gate summary briefly.
  const firstIssue = !input.gate.ok ? input.gate.issues[0]?.message : undefined;
  return firstIssue
    ? `Assembly blocked: ${firstIssue}`
    : input.gate.message;
}
