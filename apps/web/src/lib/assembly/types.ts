export type AssemblyStatus = 'pending' | 'assembling' | 'completed' | 'failed';

/**
 * Authoritative structured assembly record.
 * Project notes must not be used as the source of truth for this data.
 */
export type AssemblyRecord = {
  id: string;
  projectId: string;
  userId: string;
  status: AssemblyStatus;
  storageKey: string | null;
  metadataStorageKey: string | null;
  localPath: string | null;
  fileSizeBytes: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  usedSyntheticPlaceholders: boolean;
  upscaledFromLowerResolution: boolean;
  sceneCount: number;
  completedSceneCount: number;
  notes: string[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type UpsertAssemblyInput = Omit<
  AssemblyRecord,
  'id' | 'createdAt' | 'updatedAt' | 'completedAt'
> & {
  id?: string;
  createdAt?: string;
  completedAt?: string | null;
};

export interface AssemblyRecordStore {
  getByProject(userId: string, projectId: string): Promise<AssemblyRecord | null>;
  save(record: AssemblyRecord): Promise<AssemblyRecord>;
  markFailed(userId: string, projectId: string, error: string): Promise<AssemblyRecord>;
}

export function createAssemblyRecord(input: UpsertAssemblyInput): AssemblyRecord {
  const now = new Date().toISOString();
  return {
    id: input.id ?? crypto.randomUUID(),
    projectId: input.projectId,
    userId: input.userId,
    status: input.status,
    storageKey: input.storageKey,
    metadataStorageKey: input.metadataStorageKey,
    localPath: input.localPath,
    fileSizeBytes: input.fileSizeBytes,
    durationSeconds: input.durationSeconds,
    width: input.width,
    height: input.height,
    fps: input.fps,
    videoCodec: input.videoCodec,
    audioCodec: input.audioCodec,
    usedSyntheticPlaceholders: input.usedSyntheticPlaceholders,
    upscaledFromLowerResolution: input.upscaledFromLowerResolution,
    sceneCount: input.sceneCount,
    completedSceneCount: input.completedSceneCount,
    notes: input.notes,
    error: input.error,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    completedAt: input.completedAt ?? (input.status === 'completed' ? now : null),
  };
}
