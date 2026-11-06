import type { PatchSummary, ServerType } from '../types.js';
import { sha256, stripHtml } from '../util.js';

const BUFF_RE = /\b(buff(?:ed|s)?|increased|improved|strengthened)\b/i;
const NERF_RE = /\b(nerf(?:ed|s)?|decreased|reduced|weakened)\b/i;
const NEW_HERO_RE = /\b(new hero|hero release|added hero)\b/i;
const ITEM_RE = /\b(item|equipment|roaming item|jungle item)\b/i;
const GAMEPLAY_RE = /\b(turtle|lord|turret|map|emblem|battle spell|gameplay)\b/i;

function detectServerType(text: string, fallback: ServerType = 'original'): ServerType {
  if (/\badvanced?\s+server\b/i.test(text)) return 'advance';
  if (/\boriginal\s+server\b|\bofficial\s+server\b/i.test(text)) return 'original';
  return fallback;
}

function extractPatchId(text: string, title: string): string {
  const fromTitle = title.match(/\b(\d+\.\d+(?:\.\d+)?[A-Za-z]?)\b/);
  if (fromTitle?.[1]) return fromTitle[1];
  const fromBody = text.match(/\b(?:patch|version)\s*[#:.]?\s*(\d+\.\d+(?:\.\d+)?[A-Za-z]?)\b/i);
  if (fromBody?.[1]) return fromBody[1];
  return `undated-${sha256(title).slice(0, 10)}`;
}

/**
 * Deterministic patch-note summarizer. Does not invent numeric values.
 * Content hash is over normalized text so formatting-only changes do not create new versions.
 */
export function summarizePatchNotes(input: {
  title: string;
  htmlOrText: string;
  sourceUrl: string | null;
  serverTypeHint?: ServerType;
}): PatchSummary {
  const plain = stripHtml(input.htmlOrText);
  const normalized = plain.replace(/\s+/g, ' ').trim().toLowerCase();
  const serverType = detectServerType(`${input.title}\n${plain}`, input.serverTypeHint ?? 'original');
  // Include server_type so identical announcement text on Original vs Advance
  // remains two records (never silently collapsed across environments).
  const contentSha = sha256(`${serverType}:${normalized}`);
  const lines = plain
    .split(/[\n\r]+|(?<=\.)\s+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8 && l.length < 400);

  const newHeroes: string[] = [];
  const heroBuffs: string[] = [];
  const heroNerfs: string[] = [];
  const itemChanges: string[] = [];
  const gameplayChanges: string[] = [];

  for (const line of lines) {
    if (NEW_HERO_RE.test(line)) newHeroes.push(line);
    else if (BUFF_RE.test(line) && !ITEM_RE.test(line)) heroBuffs.push(line);
    else if (NERF_RE.test(line) && !ITEM_RE.test(line)) heroNerfs.push(line);
    else if (ITEM_RE.test(line)) itemChanges.push(line);
    else if (GAMEPLAY_RE.test(line)) gameplayChanges.push(line);
  }

  const strategicBits: string[] = [];
  if (newHeroes.length) strategicBits.push('New hero presence may shift draft priority.');
  if (heroBuffs.length || heroNerfs.length) {
    strategicBits.push('Hero power shifts may affect lane matchups and ban priority.');
  }
  if (itemChanges.length) strategicBits.push('Item adjustments may change optimal build paths.');
  if (gameplayChanges.length) {
    strategicBits.push('Objective or map changes may alter rotation timing.');
  }

  return {
    patch_identifier: extractPatchId(plain, input.title),
    server_type: serverType,
    release_date: null,
    new_heroes: newHeroes.slice(0, 40),
    hero_buffs: heroBuffs.slice(0, 80),
    hero_nerfs: heroNerfs.slice(0, 80),
    item_changes: itemChanges.slice(0, 80),
    gameplay_changes: gameplayChanges.slice(0, 80),
    strategic_implications: strategicBits.join(' ') || 'unknown',
    sources: [{ title: input.title, url: input.sourceUrl }],
    content_sha256: contentSha,
  };
}

/** True when two documents differ only by whitespace/formatting. */
export function isFormattingOnlyChange(a: string, b: string): boolean {
  const norm = (s: string) =>
    stripHtml(s).replace(/\s+/g, ' ').trim().toLowerCase();
  return sha256(norm(a)) === sha256(norm(b));
}
