import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  MemoryCharacterRepository,
  MemoryProjectRepository,
  MemoryStoryRepository,
  ProjectRecord,
  StoryRecord,
  StoryVersionRecord,
  CharacterRecord,
} from '@ai-shorts-factory/database';
import type { GenerationSceneRecord } from '@ai-shorts-factory/workflow-engine';

type MemoryStudioSnapshot = {
  version: 1;
  savedAt: string;
  projects: ProjectRecord[];
  stories: StoryRecord[];
  storyVersions: StoryVersionRecord[];
  characters: CharacterRecord[];
  characterLinks: Array<{ projectId: string; characterIds: string[] }>;
  scenesByProject: Record<string, GenerationSceneRecord[]>;
};

function snapshotPath(): string {
  return process.env.ASF_MEMORY_STUDIO_PATH?.trim() || join(process.cwd(), '.data', 'memory-studio.json');
}

export async function loadMemoryStudioSnapshot(input: {
  projects: MemoryProjectRepository;
  stories: MemoryStoryRepository;
  characters: MemoryCharacterRepository;
  scenes: Map<string, GenerationSceneRecord[]>;
}): Promise<boolean> {
  try {
    const raw = await readFile(snapshotPath(), 'utf8');
    const snapshot = JSON.parse(raw) as MemoryStudioSnapshot;
    if (snapshot.version !== 1) return false;
    input.projects.importAll(snapshot.projects ?? []);
    input.stories.importAll({
      stories: snapshot.stories ?? [],
      versions: snapshot.storyVersions ?? [],
    });
    input.characters.importAll({
      characters: snapshot.characters ?? [],
      projectLinks: snapshot.characterLinks ?? [],
    });
    input.scenes.clear();
    for (const [projectId, scenes] of Object.entries(snapshot.scenesByProject ?? {})) {
      input.scenes.set(projectId, structuredClone(scenes));
    }
    return true;
  } catch {
    return false;
  }
}

export async function saveMemoryStudioSnapshot(input: {
  projects: MemoryProjectRepository;
  stories: MemoryStoryRepository;
  characters: MemoryCharacterRepository;
  scenes: Map<string, GenerationSceneRecord[]>;
}): Promise<void> {
  const path = snapshotPath();
  await mkdir(dirname(path), { recursive: true });
  const storyExport = input.stories.exportAll();
  const characterExport = input.characters.exportAll();
  const scenesByProject: Record<string, GenerationSceneRecord[]> = {};
  for (const [projectId, scenes] of input.scenes.entries()) {
    scenesByProject[projectId] = structuredClone(scenes);
  }
  const snapshot: MemoryStudioSnapshot = {
    version: 1,
    savedAt: new Date().toISOString(),
    projects: input.projects.exportAll(),
    stories: storyExport.stories,
    storyVersions: storyExport.versions,
    characters: characterExport.characters,
    characterLinks: characterExport.projectLinks,
    scenesByProject,
  };
  await writeFile(path, JSON.stringify(snapshot, null, 2), 'utf8');
}
