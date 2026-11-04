import { describe, expect, it } from 'vitest';
import type { GenerationSceneRecord } from '@ai-shorts-factory/workflow-engine';
import {
  evaluateAssemblyGate,
  isMockProvenanceScene,
  isRealProvenanceScene,
} from './assembly-gate.js';

function baseScene(
  partial: Partial<GenerationSceneRecord> & Pick<GenerationSceneRecord, 'sceneNumber' | 'state'>,
): GenerationSceneRecord {
  return {
    id: `s${partial.sceneNumber}`,
    projectId: 'p1',
    title: `Scene ${partial.sceneNumber}`,
    durationSeconds: 8,
    flowPrompt: 'prompt',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function realScene(n: number, sha = `sha-${n}-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`): GenerationSceneRecord {
  return baseScene({
    sceneNumber: n,
    state: 'REAL_GENERATED',
    assetOrigin: 'REAL_GENERATED',
    assetStorageKey: `projects/p1/scenes/${n}/original.mp4`,
    assetChecksum: sha,
    assetMetadata: {
      bytes: 50_000,
      sha256: sha,
      contentType: 'video/mp4',
      durationSeconds: 8,
      width: 720,
      height: 1280,
      hasVideo: true,
      probedAt: '2026-01-01T00:00:00.000Z',
      originalDownloadPreserved: true,
    },
  });
}

function mockScene(n: number): GenerationSceneRecord {
  return baseScene({
    sceneNumber: n,
    state: 'COMPLETED',
    assetOrigin: 'MOCK',
    assetStorageKey: `projects/p1/scenes/${n}/mock.bin`,
    assetChecksum: `mock-${n}`,
  });
}

describe('assembly gate real/mock isolation', () => {
  it('rejects five mock COMPLETED scenes for real assembly and allows mock mode', () => {
    const scenes = [1, 2, 3, 4, 5].map(mockScene);
    const gate = evaluateAssemblyGate(scenes);
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.mode).toBe('mock');
    }
    expect(scenes.every(isMockProvenanceScene)).toBe(true);
    expect(scenes.some(isRealProvenanceScene)).toBe(false);
  });

  it('blocks real assembly when one mock scene is among four real scenes', () => {
    const scenes = [realScene(1), realScene(2), realScene(3), realScene(4), mockScene(5)];
    const gate = evaluateAssemblyGate(scenes);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.message).toMatch(/Mixed project|mock/i);
      expect(gate.issues.some((i) => i.sceneNumber === 5 || i.code === 'mixed_mode')).toBe(true);
    }
  });

  it('passes five verified REAL_GENERATED scenes', () => {
    const scenes = [1, 2, 3, 4, 5].map((n) => realScene(n));
    const gate = evaluateAssemblyGate(scenes);
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.mode).toBe('real');
      expect(gate.scenes.map((s) => s.sceneNumber)).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('rejects a scene without assetOrigin for real provenance', () => {
    const scenes = [1, 2, 3, 4, 5].map((n) => {
      const scene = realScene(n);
      if (n === 3) {
        return { ...scene, assetOrigin: undefined };
      }
      return scene;
    });
    const gate = evaluateAssemblyGate(scenes);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.issues.some((i) => i.sceneNumber === 3 && i.code === 'missing_origin')).toBe(true);
    }
  });

  it('rejects a scene with missing durable asset', () => {
    const scenes = [1, 2, 3, 4, 5].map((n) => {
      const scene = realScene(n);
      if (n === 2) {
        return { ...scene, assetStorageKey: undefined };
      }
      return scene;
    });
    const gate = evaluateAssemblyGate(scenes);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(
        gate.issues.some(
          (i) => i.sceneNumber === 2 && (i.code === 'missing_storage_key' || i.code === 'unverified_state'),
        ),
      ).toBe(true);
    }
  });

  it('rejects duplicate SHA-256 among real scenes', () => {
    const shared = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const scenes = [
      realScene(1, shared),
      realScene(2, shared),
      realScene(3),
      realScene(4),
      realScene(5),
    ];
    const gate = evaluateAssemblyGate(scenes);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.issues.some((i) => i.code === 'duplicate_checksum')).toBe(true);
    }
  });

  it('COMPLETED never counts as real provenance', () => {
    const scene = baseScene({
      sceneNumber: 1,
      state: 'COMPLETED',
      assetOrigin: 'REAL_GENERATED',
      assetStorageKey: 'x',
      assetChecksum: 'y',
      assetMetadata: {
        bytes: 10,
        sha256: 'y',
        contentType: 'video/mp4',
        durationSeconds: 8,
        hasVideo: true,
      },
    });
    expect(isRealProvenanceScene(scene)).toBe(false);
  });
});
