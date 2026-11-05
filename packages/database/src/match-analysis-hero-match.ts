export type HeroCatalogEntry = {
  hero_key: string;
  name: string;
};

export type HeroMatch = {
  hero_key: string;
  hero_name: string;
  confidence: number;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i]![0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0]![j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }
  return matrix[a.length]![b.length]!;
}

/**
 * Map OCR hero text to catalog entries from the activated patch KB.
 */
export function matchHeroFromCatalog(
  rawName: string,
  catalog: HeroCatalogEntry[],
): HeroMatch | null {
  const needle = normalize(rawName);
  if (!needle || catalog.length === 0) return null;

  let best: HeroMatch | null = null;
  for (const hero of catalog) {
    const name = normalize(hero.name);
    const key = normalize(hero.hero_key.replace(/_/g, ' '));
    if (needle === name || needle === key) {
      return { hero_key: hero.hero_key, hero_name: hero.name, confidence: 1 };
    }
    if (name.includes(needle) || needle.includes(name) || key.includes(needle)) {
      const confidence = Math.min(name.length, needle.length) / Math.max(name.length, needle.length);
      if (!best || confidence > best.confidence) {
        best = { hero_key: hero.hero_key, hero_name: hero.name, confidence: Math.max(0.75, confidence) };
      }
      continue;
    }
    const distance = Math.min(levenshtein(needle, name), levenshtein(needle, key));
    const maxLen = Math.max(needle.length, name.length, key.length, 1);
    const confidence = 1 - distance / maxLen;
    if (confidence >= 0.72 && (!best || confidence > best.confidence)) {
      best = { hero_key: hero.hero_key, hero_name: hero.name, confidence };
    }
  }
  return best;
}

export type ParsedRosterLine = {
  playerTag: string | null;
  heroNameRaw: string | null;
};

/**
 * Parse OCR lines like `ShadowFox - Natalia` or `ShadowFox|Natalia`.
 */
export function parseRosterLines(ocrText: string): ParsedRosterLine[] {
  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^loading(\s+roster)?$/i.test(line));

  const parsed: ParsedRosterLine[] = [];
  for (const line of lines) {
    const split = line.split(/\s[-–—|]\s/);
    if (split.length >= 2) {
      parsed.push({
        playerTag: split[0]!.trim() || null,
        heroNameRaw: split.slice(1).join(' - ').trim() || null,
      });
      continue;
    }
    // Single token: treat as hero name candidate when it looks alphabetic.
    if (/^[A-Za-z][A-Za-z0-9 _'-]{1,40}$/.test(line)) {
      parsed.push({ playerTag: null, heroNameRaw: line });
    }
  }
  return parsed;
}

export function measureRosterPrecision(input: {
  expected: Array<{ playerTag: string; heroKey: string }>;
  actual: Array<{ player_tag: string | null; hero_key: string | null }>;
}): { precision: number; matched: number; total: number } {
  const total = input.expected.length;
  if (total === 0) return { precision: 1, matched: 0, total: 0 };
  let matched = 0;
  for (const expected of input.expected) {
    const hit = input.actual.find(
      (row) =>
        row.hero_key === expected.heroKey &&
        (row.player_tag === null ||
          normalize(row.player_tag) === normalize(expected.playerTag)),
    );
    if (hit) matched += 1;
  }
  return { precision: matched / total, matched, total };
}
