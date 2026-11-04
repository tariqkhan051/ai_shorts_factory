/**
 * Best-effort normalization before Zod validation.
 * Never invent missing creative content; only coerce shapes/types.
 */
export function normalizeImportedScreenplay(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }

  const root = { ...(input as Record<string, unknown>) };

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
      for (const key of [
        'narration',
        'dialogue',
        'text_overlay',
        'transition_out',
        'title',
        'visual_description',
        'flow_prompt',
      ] as const) {
        if (s[key] === null || s[key] === undefined) {
          if (key === 'transition_out') s[key] = 'cut';
          else if (key === 'narration' || key === 'dialogue' || key === 'text_overlay') {
            s[key] = '';
          }
        }
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
