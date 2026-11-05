import { describe, expect, it, beforeEach } from 'vitest';
import { createSampleScreenplay } from '@ai-shorts-factory/chatgpt-import';
import { MemoryProjectRepository } from './memory-project-repository.js';
import { MemoryCharacterRepository } from './memory-character-repository.js';
import { MemoryReferenceAssetRepository } from './memory-reference-asset-repository.js';
import { syncCharactersFromScreenplay } from './sync-characters-from-screenplay.js';

describe('syncCharactersFromScreenplay', () => {
  const projects = new MemoryProjectRepository();
  const characters = new MemoryCharacterRepository(projects);
  const references = new MemoryReferenceAssetRepository(characters);
  const userId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    projects.clear();
    characters.clear();
    references.clear();
  });

  it('creates project characters from screenplay and persists across export/import', async () => {
    const project = await projects.create(userId, {
      name: 'Neon',
      category: 'cinematic',
      input: {
        idea: 'Rainy neon chase',
        existing_story: '',
        additional_instructions: '',
        character_reference_notes: '',
      },
    });

    const sync = await syncCharactersFromScreenplay(
      characters,
      userId,
      project.id,
      createSampleScreenplay(),
    );
    expect(sync.created).toHaveLength(2);
    expect(sync.missingReferences).toHaveLength(2);

    const linked = await characters.listByProject(userId, project.id);
    expect(linked.map((c) => c.screenplay_character_id).sort()).toEqual(['rina', 'the-chip']);

    const snapshot = characters.exportAll();
    characters.clear();
    characters.importAll(snapshot);
    const restored = await characters.listByProject(userId, project.id);
    expect(restored).toHaveLength(2);
  });

  it('does not overwrite library characters on name collision — reports conflict', async () => {
    const project = await projects.create(userId, {
      name: 'Neon',
      category: 'cinematic',
      input: {
        idea: 'Rainy neon chase',
        existing_story: '',
        additional_instructions: '',
        character_reference_notes: '',
      },
    });

    const library = await characters.create(userId, {
      name: 'Rina',
      description: 'Library Rina',
      visual_identity: 'Library look',
      in_library: true,
    });
    await references.create(userId, {
      characterId: library.id,
      storageKey: 'users/u/references/library/rina.png',
      contentType: 'image/png',
      byteSize: 12,
      checksumSha256: 'a'.repeat(64),
      originalFilename: 'rina.png',
      isPrimary: true,
    });

    const sync = await syncCharactersFromScreenplay(
      characters,
      userId,
      project.id,
      createSampleScreenplay(),
    );
    expect(sync.conflicts.some((c) => c.screenplayName === 'Rina')).toBe(true);
    // No divergent project copy — operator must explicitly reuse the library character.
    expect(sync.created.every((c) => c.name !== 'Rina')).toBe(true);

    const refreshedLibrary = await characters.getById(userId, library.id);
    expect(refreshedLibrary?.description).toBe('Library Rina');
    expect(refreshedLibrary?.visual_identity).toBe('Library look');
    expect(refreshedLibrary?.primary_reference_asset_id).toBeTruthy();

    const reused = await characters.reuseLibraryCharacter(
      userId,
      project.id,
      library.id,
      'rina',
    );
    expect(reused.id).toBe(library.id);
  });

  it('protects existing character visual identity on re-import', async () => {
    const project = await projects.create(userId, {
      name: 'Neon',
      category: 'cinematic',
      input: {
        idea: 'x',
        existing_story: '',
        additional_instructions: '',
        character_reference_notes: '',
      },
    });
    await syncCharactersFromScreenplay(
      characters,
      userId,
      project.id,
      createSampleScreenplay(),
    );
    const linked = await characters.listByProject(userId, project.id);
    const rina = linked.find((c) => c.screenplay_character_id === 'rina')!;
    await characters.update(userId, rina.id, {
      visual_identity_structured: {
        face: '',
        hair: '',
        eyes: '',
        skin: '',
        clothing: '',
        body: '',
        distinctive_features: 'Approved locked look',
        accessories: '',
      },
      description: 'Approved description',
      version_note: 'Operator lock',
    });

    const second = await syncCharactersFromScreenplay(
      characters,
      userId,
      project.id,
      createSampleScreenplay({ title: 'Reimport' }),
    );
    expect(second.protectedIdentity?.some((c) => c.id === rina.id)).toBe(true);
    const after = await characters.getById(userId, rina.id);
    expect(after?.visual_identity).toContain('Approved locked look');
    expect(after?.description).toBe('Approved description');
  });

  it('keeps reference assets separate when syncing character text', async () => {
    const project = await projects.create(userId, {
      name: 'Neon',
      category: 'cinematic',
      input: {
        idea: 'x',
        existing_story: '',
        additional_instructions: '',
        character_reference_notes: '',
      },
    });
    await syncCharactersFromScreenplay(
      characters,
      userId,
      project.id,
      createSampleScreenplay(),
    );
    const linked = await characters.listByProject(userId, project.id);
    const rina = linked.find((c) => c.screenplay_character_id === 'rina')!;
    const asset = await references.create(userId, {
      characterId: rina.id,
      projectId: project.id,
      storageKey: 'users/u/references/p/rina.png',
      contentType: 'image/png',
      byteSize: 8,
      checksumSha256: 'b'.repeat(64),
      originalFilename: 'rina.png',
      isPrimary: true,
    });

    await syncCharactersFromScreenplay(
      characters,
      userId,
      project.id,
      createSampleScreenplay({ title: 'Second import' }),
    );
    const after = await references.getById(userId, asset.id);
    expect(after?.storage_key).toBe(asset.storage_key);
    expect(after?.checksum_sha256).toBe(asset.checksum_sha256);
  });
});
