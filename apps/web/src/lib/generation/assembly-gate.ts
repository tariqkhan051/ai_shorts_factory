import {
  isMockAssemblyState,
  isRealAssemblyState,
} from '@ai-shorts-factory/flow-adapter';
import { BUSINESS_DEFAULTS, type AssetOrigin } from '@ai-shorts-factory/shared-types';
import type { GenerationSceneRecord } from '@ai-shorts-factory/workflow-engine';

export type AssemblyMode = 'real' | 'mock';

export type AssemblyGateIssue = {
  sceneNumber?: number;
  code:
    | 'missing_scene'
    | 'mock_origin'
    | 'missing_origin'
    | 'unverified_state'
    | 'missing_storage_key'
    | 'missing_checksum'
    | 'missing_verification'
    | 'duplicate_checksum'
    | 'mixed_mode';
  message: string;
};

export type AssemblyGateResult =
  | {
      ok: true;
      mode: AssemblyMode;
      scenes: GenerationSceneRecord[];
    }
  | {
      ok: false;
      mode: AssemblyMode | 'undetermined';
      issues: AssemblyGateIssue[];
      message: string;
    };

function sortedScenes(scenes: GenerationSceneRecord[]): GenerationSceneRecord[] {
  return scenes.slice().sort((a, b) => a.sceneNumber - b.sceneNumber);
}

export function sceneHasSuccessfulMediaVerification(scene: GenerationSceneRecord): boolean {
  const meta = scene.assetMetadata;
  return Boolean(
    meta &&
      meta.hasVideo === true &&
      typeof meta.durationSeconds === 'number' &&
      meta.durationSeconds > 0 &&
      typeof meta.sha256 === 'string' &&
      meta.sha256.length >= 32 &&
      typeof meta.bytes === 'number' &&
      meta.bytes > 0,
  );
}

export function isRealProvenanceScene(scene: GenerationSceneRecord): boolean {
  return (
    isRealAssemblyState(scene.state) &&
    scene.assetOrigin === 'REAL_GENERATED' &&
    Boolean(scene.assetStorageKey) &&
    Boolean(scene.assetChecksum) &&
    sceneHasSuccessfulMediaVerification(scene)
  );
}

export function isMockProvenanceScene(scene: GenerationSceneRecord): boolean {
  if (!isMockAssemblyState(scene.state)) return false;
  const origin: AssetOrigin | undefined = scene.assetOrigin;
  // Mock runner sets MOCK; treat missing origin on COMPLETED as mock for legacy rows.
  return origin === 'MOCK' || origin === undefined;
}

/**
 * Evaluate whether a project may assemble as real Flow media or mock/synthetic.
 * Never treats COMPLETED/mock as real. Never silently mixes modes.
 */
export function evaluateAssemblyGate(
  scenes: GenerationSceneRecord[],
  options?: { requiredCount?: number },
): AssemblyGateResult {
  const required = options?.requiredCount ?? BUSINESS_DEFAULTS.sceneCount;
  const ordered = sortedScenes(scenes);
  const issues: AssemblyGateIssue[] = [];

  if (ordered.length < required) {
    issues.push({
      code: 'missing_scene',
      message: `Need ${required} scenes, found ${ordered.length}`,
    });
  }

  const byNumber = new Map(ordered.map((scene) => [scene.sceneNumber, scene]));
  for (let n = 1; n <= required; n += 1) {
    if (!byNumber.has(n)) {
      issues.push({
        sceneNumber: n,
        code: 'missing_scene',
        message: `Scene ${n} is missing`,
      });
    }
  }

  const candidates = ordered.filter((scene) => scene.sceneNumber >= 1 && scene.sceneNumber <= required);
  const realCount = candidates.filter(isRealProvenanceScene).length;
  const mockCount = candidates.filter(isMockProvenanceScene).length;

  if (realCount === required && candidates.length >= required) {
    const checksums = new Map<string, number>();
    for (const scene of candidates) {
      if (!isRealProvenanceScene(scene)) {
        issues.push({
          sceneNumber: scene.sceneNumber,
          code: 'unverified_state',
          message: `Scene ${scene.sceneNumber} is not real-verified (${scene.state}, origin=${scene.assetOrigin ?? 'none'})`,
        });
        continue;
      }
      if (!scene.assetStorageKey) {
        issues.push({
          sceneNumber: scene.sceneNumber,
          code: 'missing_storage_key',
          message: `Scene ${scene.sceneNumber} has no durable assetStorageKey`,
        });
      }
      if (!scene.assetChecksum) {
        issues.push({
          sceneNumber: scene.sceneNumber,
          code: 'missing_checksum',
          message: `Scene ${scene.sceneNumber} has no assetChecksum`,
        });
      } else {
        const prior = checksums.get(scene.assetChecksum);
        if (prior !== undefined) {
          issues.push({
            sceneNumber: scene.sceneNumber,
            code: 'duplicate_checksum',
            message: `Scene ${scene.sceneNumber} duplicates SHA-256 of scene ${prior}`,
          });
        } else {
          checksums.set(scene.assetChecksum, scene.sceneNumber);
        }
      }
      if (!sceneHasSuccessfulMediaVerification(scene)) {
        issues.push({
          sceneNumber: scene.sceneNumber,
          code: 'missing_verification',
          message: `Scene ${scene.sceneNumber} lacks successful media verification metadata`,
        });
      }
    }

    if (issues.length === 0) {
      return {
        ok: true,
        mode: 'real',
        scenes: candidates.filter((s) => s.sceneNumber >= 1 && s.sceneNumber <= required),
      };
    }
    return {
      ok: false,
      mode: 'real',
      issues,
      message: formatGateMessage('real', issues),
    };
  }

  if (mockCount === required && candidates.length >= required && realCount === 0) {
    // Mock path: COMPLETED scenes only — synthetic placeholders allowed by assemble caller.
    for (const scene of candidates) {
      if (!isMockProvenanceScene(scene)) {
        issues.push({
          sceneNumber: scene.sceneNumber,
          code: 'unverified_state',
          message: `Scene ${scene.sceneNumber} is not mock-complete (${scene.state}, origin=${scene.assetOrigin ?? 'none'})`,
        });
      }
      if (scene.assetOrigin === 'REAL_GENERATED') {
        issues.push({
          sceneNumber: scene.sceneNumber,
          code: 'mixed_mode',
          message: `Scene ${scene.sceneNumber} is REAL_GENERATED — cannot mix into mock assembly`,
        });
      }
    }
    if (issues.length === 0) {
      return {
        ok: true,
        mode: 'mock',
        scenes: candidates.filter((s) => s.sceneNumber >= 1 && s.sceneNumber <= required),
      };
    }
  }

  // Mixed or incomplete — actionable diagnostics for every scene.
  for (let n = 1; n <= required; n += 1) {
    const scene = byNumber.get(n);
    if (!scene) continue;
    if (isRealProvenanceScene(scene) || isMockProvenanceScene(scene)) continue;
    if (!scene.assetOrigin) {
      issues.push({
        sceneNumber: n,
        code: 'missing_origin',
        message: `Scene ${n} has no assetOrigin (state=${scene.state})`,
      });
    } else if (scene.assetOrigin === 'MOCK' || isMockAssemblyState(scene.state)) {
      issues.push({
        sceneNumber: n,
        code: 'mock_origin',
        message: `Scene ${n} is mock-generated and cannot satisfy a real assembly gate`,
      });
    } else if (!scene.assetStorageKey) {
      issues.push({
        sceneNumber: n,
        code: 'missing_storage_key',
        message: `Scene ${n} has no durable asset reference`,
      });
    } else if (!sceneHasSuccessfulMediaVerification(scene)) {
      issues.push({
        sceneNumber: n,
        code: 'missing_verification',
        message: `Scene ${n} is unverified (state=${scene.state})`,
      });
    } else {
      issues.push({
        sceneNumber: n,
        code: 'unverified_state',
        message: `Scene ${n} is not assembly-ready (state=${scene.state}, origin=${scene.assetOrigin})`,
      });
    }
  }

  if (realCount > 0 && mockCount > 0) {
    issues.push({
      code: 'mixed_mode',
      message: `Mixed project: ${realCount} real-verified and ${mockCount} mock scenes — assemble one mode only`,
    });
  }

  const unique = dedupeIssues(issues);
  return {
    ok: false,
    mode: realCount > 0 ? 'real' : mockCount > 0 ? 'mock' : 'undetermined',
    issues: unique,
    message: formatGateMessage(realCount > 0 ? 'real' : 'mock', unique),
  };
}

function dedupeIssues(issues: AssemblyGateIssue[]): AssemblyGateIssue[] {
  const seen = new Set<string>();
  const out: AssemblyGateIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.code}:${issue.sceneNumber ?? ''}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

function formatGateMessage(mode: string, issues: AssemblyGateIssue[]): string {
  const lines = issues.map((issue) =>
    issue.sceneNumber !== undefined
      ? `Scene ${issue.sceneNumber}: ${issue.message}`
      : issue.message,
  );
  return `Cannot run ${mode} assembly:\n${lines.join('\n')}`;
}
