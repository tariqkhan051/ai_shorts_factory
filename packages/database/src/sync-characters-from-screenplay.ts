import {
  formatVisualIdentity,
  slugifyCharacterId,
  type ScreenplayV1,
} from '@ai-shorts-factory/validation';
import type {
  CharacterRecord,
  CharacterRepository,
  SyncCharactersResult,
} from './story-types.js';

/**
 * Persist screenplay cast into project characters.
 * Never silently overwrites a reusable library character — name collisions become conflicts.
 */
export async function syncCharactersFromScreenplay(
  characters: CharacterRepository,
  userId: string,
  projectId: string,
  screenplay: ScreenplayV1,
): Promise<SyncCharactersResult> {
  const linked = await characters.listByProject(userId, projectId);
  const library = await characters.listLibrary(userId);
  const libraryByName = new Map(library.map((c) => [c.name.trim().toLowerCase(), c]));

  const byScreenplayId = new Map(
    linked
      .filter((c) => c.screenplay_character_id)
      .map((c) => [c.screenplay_character_id!, c]),
  );
  const byName = new Map(linked.map((c) => [c.name.trim().toLowerCase(), c]));

  const created: CharacterRecord[] = [];
  const updated: CharacterRecord[] = [];
  const linkedOut: CharacterRecord[] = [];
  const conflicts: SyncCharactersResult['conflicts'] = [];
  const keepIds = new Set<string>();
  const usedIds = new Set<string>();

  for (const cast of screenplay.characters) {
    const screenplayId =
      cast.character_id?.trim() || slugifyCharacterId(cast.name, usedIds);
    if (cast.character_id?.trim()) usedIds.add(screenplayId);
    const nameKey = cast.name.trim().toLowerCase();
    const visualStructured = cast.visual_identity;
    void formatVisualIdentity(visualStructured);
    const clothing = cast.clothing || visualStructured.clothing || '';
    const appearance = cast.appearance_details || visualStructured.distinctive_features || '';

    const existingLinked =
      byScreenplayId.get(screenplayId) ?? byName.get(nameKey) ?? null;

    if (existingLinked) {
      const next = await characters.update(userId, existingLinked.id, {
        name: cast.name,
        description: cast.description,
        visual_identity_structured: visualStructured,
        clothing,
        appearance_details: appearance,
        screenplay_character_id: screenplayId,
        role: cast.role,
        age_range: cast.age_range,
        continuity_rules: cast.continuity_rules,
        reference_image_prompt: cast.reference_image_prompt,
        voice_description: cast.voice_description,
        dialogue_style: cast.dialogue_style,
        version_note: 'Synced from screenplay import',
      });
      keepIds.add(next.id);
      updated.push(next);
      linkedOut.push(next);
      continue;
    }

    const libraryMatch = libraryByName.get(nameKey);
    if (libraryMatch && !linked.some((c) => c.id === libraryMatch.id)) {
      conflicts.push({
        screenplayCharacterId: screenplayId,
        screenplayName: cast.name,
        libraryCharacter: libraryMatch,
      });
      // Create a project-scoped copy so import still progresses; operator can replace via Reuse.
      const projectCopy = await characters.create(userId, {
        name: cast.name,
        description: cast.description,
        visual_identity_structured: visualStructured,
        clothing,
        appearance_details: appearance,
        screenplay_character_id: screenplayId,
        role: cast.role,
        age_range: cast.age_range,
        continuity_rules: cast.continuity_rules,
        reference_image_prompt: cast.reference_image_prompt,
        voice_description: cast.voice_description,
        dialogue_style: cast.dialogue_style,
        in_library: false,
      });
      await characters.linkToProject(userId, projectId, projectCopy.id);
      keepIds.add(projectCopy.id);
      created.push(projectCopy);
      linkedOut.push(projectCopy);
      continue;
    }

    const createdCharacter = await characters.create(userId, {
      name: cast.name,
      description: cast.description,
      visual_identity_structured: visualStructured,
      clothing,
      appearance_details: appearance,
      screenplay_character_id: screenplayId,
      role: cast.role,
      age_range: cast.age_range,
      continuity_rules: cast.continuity_rules,
      reference_image_prompt: cast.reference_image_prompt,
      voice_description: cast.voice_description,
      dialogue_style: cast.dialogue_style,
      in_library: false,
    });
    await characters.linkToProject(userId, projectId, createdCharacter.id);
    keepIds.add(createdCharacter.id);
    created.push(createdCharacter);
    linkedOut.push(createdCharacter);
  }

  // Unlink project characters that vanished from the screenplay and are unused (no primary ref).
  for (const existing of linked) {
    if (keepIds.has(existing.id)) continue;
    if (existing.primary_reference_asset_id) continue;
    if (existing.in_library) {
      await characters.unlinkFromProject(userId, projectId, existing.id);
      continue;
    }
    await characters.unlinkFromProject(userId, projectId, existing.id);
    await characters.delete(userId, existing.id);
  }

  const missingReferences = linkedOut.filter((c) => !c.primary_reference_asset_id);

  return { created, updated, linked: linkedOut, conflicts, missingReferences };
}

export function scenesForCharacter(
  screenplay: ScreenplayV1,
  screenplayCharacterId: string | null | undefined,
  characterName: string,
): number[] {
  const id = screenplayCharacterId?.trim();
  const name = characterName.trim().toLowerCase();
  const scenes: number[] = [];
  for (const scene of screenplay.scenes) {
    if (id && scene.character_ids.includes(id)) {
      scenes.push(scene.scene_number);
      continue;
    }
    const haystack = [
      scene.dialogue,
      scene.visual_description,
      scene.flow_prompt,
      scene.narration,
    ]
      .join('\n')
      .toLowerCase();
    if (name.length >= 2 && haystack.includes(name)) {
      scenes.push(scene.scene_number);
    }
  }
  return scenes;
}
