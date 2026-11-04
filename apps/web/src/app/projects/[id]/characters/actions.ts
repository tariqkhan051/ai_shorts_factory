'use server';

import { revalidatePath } from 'next/cache';
import { buildReferenceAssetKey } from '@ai-shorts-factory/storage';
import { requireUser } from '@/lib/auth';
import { getObjectStorage } from '@/lib/storage';
import { validateReferenceImageBytes } from '@/lib/characters/reference-image';
import {
  getCharacterRepository,
  getReferenceAssetRepository,
  getStoryRepository,
  persistMemoryStudioNow,
} from '@/lib/projects/repository';

export type CharacterActionState = {
  ok: boolean;
  message?: string;
  errors?: string[];
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function revalidateCharacters(projectId: string) {
  await persistMemoryStudioNow();
  revalidatePath('/');
  revalidatePath('/projects');
  revalidatePath('/characters');
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/story`);
  revalidatePath(`/projects/${projectId}/characters`);
  revalidatePath(`/projects/${projectId}/flow-package`);
}

export async function markCharactersReviewedAction(projectId: string): Promise<void> {
  const user = await requireUser();
  const stories = await getStoryRepository();
  await stories.markCharactersReviewed(user.id, projectId);
  await revalidateCharacters(projectId);
}

export async function updateCharacterAction(
  projectId: string,
  characterId: string,
  _prev: CharacterActionState,
  formData: FormData,
): Promise<CharacterActionState> {
  try {
    const user = await requireUser();
    const characters = await getCharacterRepository();
    await characters.update(user.id, characterId, {
      name: formString(formData, 'name'),
      description: formString(formData, 'description'),
      role: formString(formData, 'role'),
      age_range: formString(formData, 'age_range'),
      visual_identity: formString(formData, 'visual_identity'),
      clothing: formString(formData, 'clothing'),
      appearance_details: formString(formData, 'appearance_details'),
      continuity_rules: formString(formData, 'continuity_rules'),
      reference_image_prompt: formString(formData, 'reference_image_prompt'),
      voice_description: formString(formData, 'voice_description'),
      dialogue_style: formString(formData, 'dialogue_style'),
      version_note: 'Edited in Character Review',
    });
    await revalidateCharacters(projectId);
    return { ok: true, message: 'Character updated' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to update character',
    };
  }
}

export async function addProjectCharacterAction(
  projectId: string,
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const characters = await getCharacterRepository();
  const character = await characters.create(user.id, {
    name: formString(formData, 'name'),
    description: formString(formData, 'description'),
    visual_identity: formString(formData, 'visual_identity'),
    clothing: formString(formData, 'clothing'),
    appearance_details: formString(formData, 'appearance_details'),
    role: formString(formData, 'role'),
    age_range: formString(formData, 'age_range'),
    continuity_rules: formString(formData, 'continuity_rules'),
    screenplay_character_id: formString(formData, 'screenplay_character_id') || undefined,
    in_library: false,
  });
  await characters.linkToProject(user.id, projectId, character.id);
  await revalidateCharacters(projectId);
}

export async function removeProjectCharacterAction(
  projectId: string,
  characterId: string,
): Promise<void> {
  const user = await requireUser();
  const characters = await getCharacterRepository();
  const character = await characters.getById(user.id, characterId);
  await characters.unlinkFromProject(user.id, projectId, characterId);
  if (character && !character.in_library && !character.primary_reference_asset_id) {
    await characters.delete(user.id, characterId);
  }
  await revalidateCharacters(projectId);
}

export async function saveCharacterToLibraryAction(
  projectId: string,
  characterId: string,
): Promise<void> {
  const user = await requireUser();
  const characters = await getCharacterRepository();
  await characters.saveToLibrary(user.id, characterId);
  await revalidateCharacters(projectId);
}

export async function reuseLibraryCharacterAction(
  projectId: string,
  libraryCharacterId: string,
  screenplayCharacterId: string,
  replaceCharacterId?: string,
): Promise<void> {
  const user = await requireUser();
  const characters = await getCharacterRepository();
  if (replaceCharacterId) {
    await characters.unlinkFromProject(user.id, projectId, replaceCharacterId);
    const replaced = await characters.getById(user.id, replaceCharacterId);
    if (replaced && !replaced.in_library && !replaced.primary_reference_asset_id) {
      await characters.delete(user.id, replaceCharacterId);
    }
  }
  await characters.reuseLibraryCharacter(
    user.id,
    projectId,
    libraryCharacterId,
    screenplayCharacterId || undefined,
  );
  await revalidateCharacters(projectId);
}

export async function uploadCharacterReferenceAction(
  projectId: string,
  characterId: string,
  _prev: CharacterActionState,
  formData: FormData,
): Promise<CharacterActionState> {
  try {
    const user = await requireUser();
    const file = formData.get('image');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'Choose a PNG, JPEG, or WebP image' };
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const validated = validateReferenceImageBytes({
      bytes,
      filename: file.name || 'reference.png',
      declaredContentType: file.type,
    });

    const storage = getObjectStorage();
    const key = buildReferenceAssetKey({
      userId: user.id,
      projectId,
      filename: `${characterId}-${validated.sha256.slice(0, 12)}.${validated.extension}`,
    });
    await storage.putObject({
      key,
      body: validated.bytes,
      contentType: validated.contentType,
      checksumSha256: validated.sha256,
    });

    const references = await getReferenceAssetRepository();
    const characters = await getCharacterRepository();
    const character = await characters.getById(user.id, characterId);
    if (!character) {
      return { ok: false, message: 'Character not found' };
    }
    const existing = await references.listByCharacter(user.id, characterId);
    const requestedPrimary = formData.get('is_primary') === 'true';
    const makePrimary = requestedPrimary || existing.length === 0;
    await references.create(user.id, {
      characterId,
      projectId,
      storageKey: key,
      contentType: validated.contentType,
      byteSize: validated.byteSize,
      checksumSha256: validated.sha256,
      originalFilename: validated.originalFilename,
      isPrimary: makePrimary,
      notes: formString(formData, 'notes'),
    });

    await revalidateCharacters(projectId);
    return { ok: true, message: 'Reference image uploaded' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Reference upload failed',
    };
  }
}

export async function removeCharacterReferenceAction(
  projectId: string,
  assetId: string,
): Promise<void> {
  const user = await requireUser();
  const references = await getReferenceAssetRepository();
  // Soft-delete metadata only — durable object retained for audit/reuse.
  await references.remove(user.id, assetId);
  await revalidateCharacters(projectId);
}

export async function setPrimaryReferenceAction(
  projectId: string,
  characterId: string,
  assetId: string,
): Promise<void> {
  const user = await requireUser();
  const references = await getReferenceAssetRepository();
  await references.setPrimary(user.id, characterId, assetId);
  await revalidateCharacters(projectId);
}
