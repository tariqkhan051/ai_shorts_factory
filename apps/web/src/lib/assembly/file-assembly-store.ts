import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AssemblyRecord, AssemblyRecordStore } from './types';
import { createAssemblyRecord } from './types';

function dataRoot(): string {
  return process.env.ASF_DATA_DIR?.trim() || join(process.cwd(), '.data');
}

export function assemblyProjectDir(projectId: string): string {
  return join(dataRoot(), 'assemblies', projectId);
}

export function assemblyRecordPath(projectId: string): string {
  return join(assemblyProjectDir(projectId), 'record.json');
}

export function assemblyVideoPath(projectId: string): string {
  return join(assemblyProjectDir(projectId), 'final.mp4');
}

/**
 * File-backed assembly records under `.data/assemblies/{projectId}/`.
 * Local durable store for development; object storage remains the cloud path abstraction.
 */
export class FileAssemblyRecordStore implements AssemblyRecordStore {
  async getByProject(userId: string, projectId: string): Promise<AssemblyRecord | null> {
    try {
      const raw = await readFile(assemblyRecordPath(projectId), 'utf8');
      const record = JSON.parse(raw) as AssemblyRecord;
      if (record.userId !== userId) {
        return null;
      }
      return record;
    } catch {
      return null;
    }
  }

  async save(record: AssemblyRecord): Promise<AssemblyRecord> {
    const dir = assemblyProjectDir(record.projectId);
    await mkdir(dir, { recursive: true });
    const next: AssemblyRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
      completedAt:
        record.status === 'completed'
          ? (record.completedAt ?? new Date().toISOString())
          : record.completedAt,
    };
    await writeFile(assemblyRecordPath(record.projectId), JSON.stringify(next, null, 2), 'utf8');
    return next;
  }

  async markFailed(userId: string, projectId: string, error: string): Promise<AssemblyRecord> {
    const existing = await this.getByProject(userId, projectId);
    const failed = createAssemblyRecord({
      id: existing?.id,
      createdAt: existing?.createdAt,
      projectId,
      userId,
      status: 'failed',
      storageKey: existing?.storageKey ?? null,
      metadataStorageKey: existing?.metadataStorageKey ?? null,
      localPath: existing?.localPath ?? null,
      fileSizeBytes: existing?.fileSizeBytes ?? null,
      durationSeconds: existing?.durationSeconds ?? null,
      width: existing?.width ?? null,
      height: existing?.height ?? null,
      fps: existing?.fps ?? null,
      videoCodec: existing?.videoCodec ?? null,
      audioCodec: existing?.audioCodec ?? null,
      usedSyntheticPlaceholders: existing?.usedSyntheticPlaceholders ?? true,
      upscaledFromLowerResolution: existing?.upscaledFromLowerResolution ?? true,
      sceneCount: existing?.sceneCount ?? 5,
      completedSceneCount: existing?.completedSceneCount ?? 0,
      notes: existing?.notes ?? [],
      error,
      completedAt: null,
    });
    return this.save(failed);
  }
}

export async function assertLocalVideoExists(projectId: string): Promise<boolean> {
  try {
    await access(assemblyVideoPath(projectId));
    return true;
  } catch {
    return false;
  }
}
