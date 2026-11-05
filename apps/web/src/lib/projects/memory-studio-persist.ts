import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  BrandRecord,
  CharacterRecord,
  CharacterVersionRecord,
  EnvironmentRecord,
  MemoryBrandRepository,
  MemoryCharacterRepository,
  MemoryDistributionRepository,
  MemoryEnvironmentRepository,
  MemoryProjectDnaRepository,
  MemoryProjectRepository,
  MemoryReferenceAssetRepository,
  MemorySocialAccountRepository,
  MemoryStoryRepository,
  MemoryVideoRepository,
  ProjectDnaVersionRecord,
  ProjectRecord,
  ProjectSocialAccountRecord,
  ReferenceAssetRecord,
  SocialAccountRecord,
  StoryRecord,
  StoryVersionRecord,
  VideoDistributionRecord,
  VideoRecord,
} from '@ai-shorts-factory/database';
import type { GenerationSceneRecord } from '@ai-shorts-factory/workflow-engine';

type MemoryStudioSnapshot = {
  version: 1 | 2;
  savedAt: string;
  projects: ProjectRecord[];
  stories: StoryRecord[];
  storyVersions: StoryVersionRecord[];
  characters: CharacterRecord[];
  characterLinks: Array<{ projectId: string; characterIds: string[] }>;
  characterVersions?: CharacterVersionRecord[];
  referenceAssets?: ReferenceAssetRecord[];
  scenesByProject: Record<string, GenerationSceneRecord[]>;
  brands?: BrandRecord[];
  dnaVersions?: ProjectDnaVersionRecord[];
  videos?: VideoRecord[];
  environments?: EnvironmentRecord[];
  socialAccounts?: SocialAccountRecord[];
  socialLinks?: ProjectSocialAccountRecord[];
  distributions?: VideoDistributionRecord[];
};

function snapshotPath(): string {
  return process.env.ASF_MEMORY_STUDIO_PATH?.trim() || join(process.cwd(), '.data', 'memory-studio.json');
}

export async function loadMemoryStudioSnapshot(input: {
  projects: MemoryProjectRepository;
  stories: MemoryStoryRepository;
  characters: MemoryCharacterRepository;
  references: MemoryReferenceAssetRepository;
  scenes: Map<string, GenerationSceneRecord[]>;
  brands?: MemoryBrandRepository;
  dna?: MemoryProjectDnaRepository;
  videos?: MemoryVideoRepository;
  environments?: MemoryEnvironmentRepository;
  social?: MemorySocialAccountRepository;
  distributions?: MemoryDistributionRepository;
}): Promise<boolean> {
  try {
    const raw = await readFile(snapshotPath(), 'utf8');
    const snapshot = JSON.parse(raw) as MemoryStudioSnapshot;
    if (snapshot.version !== 1 && snapshot.version !== 2) return false;
    input.projects.importAll(snapshot.projects ?? []);
    input.stories.importAll({
      stories: snapshot.stories ?? [],
      versions: snapshot.storyVersions ?? [],
    });
    input.characters.importAll({
      characters: snapshot.characters ?? [],
      projectLinks: snapshot.characterLinks ?? [],
      versions: snapshot.characterVersions ?? [],
    });
    input.references.importAll(snapshot.referenceAssets ?? []);
    input.scenes.clear();
    for (const [projectId, scenes] of Object.entries(snapshot.scenesByProject ?? {})) {
      input.scenes.set(projectId, structuredClone(scenes));
    }
    input.brands?.importAll(snapshot.brands ?? []);
    input.dna?.importAll(snapshot.dnaVersions ?? []);
    input.videos?.importAll(snapshot.videos ?? []);
    input.environments?.importAll(snapshot.environments ?? []);
    input.social?.importAll({
      accounts: snapshot.socialAccounts ?? [],
      links: snapshot.socialLinks ?? [],
    });
    input.distributions?.importAll(snapshot.distributions ?? []);
    return true;
  } catch {
    return false;
  }
}

export async function saveMemoryStudioSnapshot(input: {
  projects: MemoryProjectRepository;
  stories: MemoryStoryRepository;
  characters: MemoryCharacterRepository;
  references: MemoryReferenceAssetRepository;
  scenes: Map<string, GenerationSceneRecord[]>;
  brands?: MemoryBrandRepository;
  dna?: MemoryProjectDnaRepository;
  videos?: MemoryVideoRepository;
  environments?: MemoryEnvironmentRepository;
  social?: MemorySocialAccountRepository;
  distributions?: MemoryDistributionRepository;
}): Promise<void> {
  const path = snapshotPath();
  await mkdir(dirname(path), { recursive: true });
  const storyExport = input.stories.exportAll();
  const characterExport = input.characters.exportAll();
  const socialExport = input.social?.exportAll();
  const scenesByProject: Record<string, GenerationSceneRecord[]> = {};
  for (const [projectId, scenes] of input.scenes.entries()) {
    scenesByProject[projectId] = structuredClone(scenes);
  }
  const snapshot: MemoryStudioSnapshot = {
    version: 2,
    savedAt: new Date().toISOString(),
    projects: input.projects.exportAll(),
    stories: storyExport.stories,
    storyVersions: storyExport.versions,
    characters: characterExport.characters,
    characterLinks: characterExport.projectLinks,
    characterVersions: characterExport.versions,
    referenceAssets: input.references.exportAll(),
    scenesByProject,
    brands: input.brands?.exportAll() ?? [],
    dnaVersions: input.dna?.exportAll() ?? [],
    videos: input.videos?.exportAll() ?? [],
    environments: input.environments?.exportAll() ?? [],
    socialAccounts: socialExport?.accounts ?? [],
    socialLinks: socialExport?.links ?? [],
    distributions: input.distributions?.exportAll() ?? [],
  };
  await writeFile(path, JSON.stringify(snapshot, null, 2), 'utf8');
}
