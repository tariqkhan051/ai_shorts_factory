import { slugifyCharacterId } from '@ai-shorts-factory/validation';

/**
 * Best-effort normalization before Zod validation.
 * Never invent missing creative content; only coerce shapes/types and stable IDs.
 */
export function normalizeImportedScreenplay(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }

  const root = { ...(input as Record<string, unknown>) };
  const usedIds = new Set<string>();

  if (Array.isArray(root.characters)) {
    root.characters = root.characters.map((character) => {
      if (!character || typeof character !== 'object' || Array.isArray(character)) {
        return character;
      }
      const c = { ...(character as Record<string, unknown>) };

      if (typeof c.character_id === 'string' && c.character_id.trim()) {
        const id = c.character_id.trim();
        if (usedIds.has(id)) {
          c.character_id = slugifyCharacterId(String(c.name ?? id), usedIds);
        } else {
          usedIds.add(id);
          c.character_id = id;
        }
      } else if (typeof c.name === 'string' && c.name.trim()) {
        c.character_id = slugifyCharacterId(c.name, usedIds);
      }

      // Merge legacy flat clothing / appearance into structured visual_identity.
      if (typeof c.visual_identity === 'string') {
        const text = c.visual_identity.trim();
        const clothing = typeof c.clothing === 'string' ? c.clothing.trim() : '';
        const appearance =
          typeof c.appearance_details === 'string' ? c.appearance_details.trim() : '';
        c.visual_identity = {
          face: '',
          hair: '',
          eyes: '',
          skin: '',
          clothing,
          body: '',
          distinctive_features: [text, appearance].filter(Boolean).join('; '),
          accessories: '',
        };
      } else if (c.visual_identity && typeof c.visual_identity === 'object') {
        const vi = { ...(c.visual_identity as Record<string, unknown>) };
        if (!vi.clothing && typeof c.clothing === 'string') {
          vi.clothing = c.clothing;
        }
        if (
          !vi.distinctive_features &&
          typeof c.appearance_details === 'string' &&
          c.appearance_details.trim()
        ) {
          vi.distinctive_features = c.appearance_details;
        }
        c.visual_identity = vi;
      }

      for (const key of [
        'role',
        'age_range',
        'reference_image_prompt',
        'continuity_rules',
      ] as const) {
        if (c[key] === null || c[key] === undefined) c[key] = '';
      }

      return c;
    });
  }

  const characterEntries: Array<{ id: string; name: string }> = [];
  if (Array.isArray(root.characters)) {
    for (const character of root.characters) {
      if (!character || typeof character !== 'object' || Array.isArray(character)) continue;
      const c = character as Record<string, unknown>;
      if (typeof c.character_id === 'string' && typeof c.name === 'string') {
        characterEntries.push({ id: c.character_id, name: c.name });
      }
    }
  }

  if (Array.isArray(root.scenes)) {
    root.scenes = root.scenes.map((scene, index) => {
      if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
        return scene;
      }
      const s = { ...(scene as Record<string, unknown>) };
      if (typeof s.scene_number === 'string' && s.scene_number.trim() !== '') {
        const n = Number(s.scene_number);
        if (Number.isFinite(n)) s.scene_number = n;
      }
      if (s.scene_number === undefined) {
        s.scene_number = index + 1;
      }
      if (typeof s.duration_seconds === 'string' && s.duration_seconds.trim() !== '') {
        const n = Number(s.duration_seconds);
        if (Number.isFinite(n)) s.duration_seconds = n;
      }

      // visual_prompt → flow_prompt alias
      if (
        (!s.flow_prompt || (typeof s.flow_prompt === 'string' && !s.flow_prompt.trim())) &&
        typeof s.visual_prompt === 'string' &&
        s.visual_prompt.trim()
      ) {
        s.flow_prompt = s.visual_prompt;
      }
      if (
        (!s.visual_description ||
          (typeof s.visual_description === 'string' && !s.visual_description.trim())) &&
        typeof s.visual_prompt === 'string' &&
        s.visual_prompt.trim()
      ) {
        s.visual_description = s.visual_prompt;
      }

      for (const key of [
        'narration',
        'dialogue',
        'text_overlay',
        'transition_out',
        'title',
        'visual_description',
        'flow_prompt',
        'audio_direction',
        'camera_direction',
        'environment',
        'lighting',
      ] as const) {
        if (s[key] === null || s[key] === undefined) {
          if (key === 'transition_out') s[key] = 'cut';
          else if (
            key === 'narration' ||
            key === 'dialogue' ||
            key === 'text_overlay' ||
            key === 'audio_direction' ||
            key === 'camera_direction' ||
            key === 'environment' ||
            key === 'lighting'
          ) {
            s[key] = '';
          }
        }
      }

      // Infer character_ids from name mentions when missing (legacy JSON).
      if (!Array.isArray(s.character_ids) || s.character_ids.length === 0) {
        const haystack = [
          String(s.dialogue ?? ''),
          String(s.visual_description ?? ''),
          String(s.flow_prompt ?? ''),
          String(s.narration ?? ''),
        ]
          .join('\n')
          .toLowerCase();
        const inferred: string[] = [];
        for (const entry of characterEntries) {
          const name = entry.name.trim().toLowerCase();
          if (name.length >= 2 && haystack.includes(name)) {
            inferred.push(entry.id);
          }
        }
        s.character_ids = inferred;
      } else {
        s.character_ids = (s.character_ids as unknown[])
          .map((id) => (typeof id === 'string' ? id.trim() : ''))
          .filter(Boolean);
      }

      return s;
    });
  }

  if (root.publishing_metadata && typeof root.publishing_metadata === 'object') {
    const meta = { ...(root.publishing_metadata as Record<string, unknown>) };
    if (!Array.isArray(meta.tags)) {
      meta.tags = [];
    }
    root.publishing_metadata = meta;
  }

  return root;
}

export function parseImportedJsonText(
  raw: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: 'Paste is empty.' };
  }

  // Strip accidental markdown fences from ChatGPT copy/paste.
  const withoutFences = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return { ok: true, value: JSON.parse(withoutFences) };
  } catch {
    return {
      ok: false,
      message: 'Invalid JSON. Paste the raw JSON object returned by ChatGPT.',
    };
  }
}
