/**
 * Parse operator-pasted / file JSON for game knowledge import.
 * Strips optional markdown fences; does not invent content.
 */
export function parseGameKnowledgeImportJsonText(
  raw: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: 'Import text is empty' };
  }

  let candidate = trimmed;
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  if (fence?.[1]) {
    candidate = fence[1].trim();
  }

  try {
    return { ok: true, value: JSON.parse(candidate) as unknown };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';
    return { ok: false, message: `Invalid JSON: ${message}` };
  }
}
