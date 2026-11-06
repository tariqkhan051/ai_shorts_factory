import type { ExtractedHero } from '../types.js';
import { clampConfidence, stripHtml, toSnakeKey } from '../util.js';

function extractDataSource(html: string, key: string): string | null {
  const re = new RegExp(
    `data-source="${key}"[\\s\\S]*?<div class="pi-data-value[^"]*"[^>]*>([\\s\\S]*?)</div>`,
    'i',
  );
  const match = html.match(re);
  if (!match?.[1]) return null;
  const text = stripHtml(match[1]);
  return text || null;
}

function extractListFromDataSource(html: string, key: string): string[] {
  const value = extractDataSource(html, key);
  if (!value) return [];
  return value
    .split(/[,|/]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.toLowerCase());
}

function extractSectionPlain(html: string, sectionId: string): string {
  const re = new RegExp(
    `id="${sectionId}"[\\s\\S]*?(?=<h[23][^>]*id=|<div class="mw-heading"|$)`,
    'i',
  );
  const match = html.match(re);
  if (!match) return '';
  return stripHtml(match[0]).slice(0, 4000);
}

function abilityFromSection(
  html: string,
  sectionId: string,
  slot: ExtractedHero['abilities'][number]['slot'],
  fallbackName: string,
): ExtractedHero['abilities'][number] | null {
  const text = extractSectionPlain(html, sectionId);
  if (!text) return null;
  // Prefer "Name — description" patterns common on the wiki.
  const nameMatch = text.match(/^(?:Passive|Skill\s*[12]|Ultimate)\s*(.+?)(?:Cooldown|Base damage|Type|$)/i);
  const name = (nameMatch?.[1] ?? fallbackName).trim().slice(0, 120) || fallbackName;
  const cooldownMatch = text.match(/Cooldown\s*[:：]?\s*([0-9./\s]+)/i);
  return {
    ability_key: toSnakeKey(name),
    slot,
    name,
    description: text.slice(0, 2000),
    effects: '',
    damage_types: [],
    cc_types: [],
    experimental: false,
    cooldown: cooldownMatch?.[1]?.trim() ?? null,
  };
}

/**
 * Deterministic extraction from Fandom rendered hero HTML (MediaWiki parse prop=text).
 * Community-derived — numerical cooldowns/damage marked unknown unless explicitly present.
 */
export function parseFandomHeroHtml(input: {
  title: string;
  html: string;
  sourceUrl: string;
}): ExtractedHero {
  const { title, html, sourceUrl } = input;
  const name = extractDataSource(html, 'name') ?? title;
  const roles = extractListFromDataSource(html, 'role');
  const lanes = extractListFromDataSource(html, 'lane');
  const specialty = extractDataSource(html, 'specialty');
  const difficulty = extractDataSource(html, 'difficulty');
  const release = extractDataSource(html, 'release_date');
  const dmgType = extractDataSource(html, 'dmg_type');
  const unknown: string[] = [];

  const abilities: ExtractedHero['abilities'] = [];
  const passive = abilityFromSection(html, 'Passive', 'passive', 'Passive');
  const s1 = abilityFromSection(html, 'Skill_1', 'skill1', 'Skill 1');
  const s2 = abilityFromSection(html, 'Skill_2', 'skill2', 'Skill 2');
  const ult = abilityFromSection(html, 'Ultimate', 'ultimate', 'Ultimate');
  for (const ability of [passive, s1, s2, ult]) {
    if (ability) abilities.push(ability);
  }
  if (abilities.length === 0) unknown.push('abilities');

  const damageTypes = dmgType ? [dmgType.toLowerCase()] : [];
  if (!difficulty) unknown.push('difficulty');
  if (!release) unknown.push('release_info');

  const evidence = stripHtml(html).slice(0, 6000);
  let confidence = 0.55;
  if (roles.length) confidence += 0.1;
  if (lanes.length) confidence += 0.05;
  if (abilities.length >= 3) confidence += 0.15;
  if (difficulty) confidence += 0.05;

  return {
    hero_key: toSnakeKey(name),
    name,
    aliases: [],
    roles: roles.length ? roles : specialty ? [specialty.toLowerCase()] : [],
    lanes,
    description: specialty ? `Specialty: ${specialty}` : '',
    passive: passive
      ? { name: passive.name, summary: passive.description.slice(0, 400), cooldown: passive.cooldown }
      : {},
    damage_types: damageTypes,
    cc_types: [],
    difficulty,
    release_info: release,
    abilities,
    unknown_fields: unknown,
    evidence_text: evidence,
    source_url: sourceUrl,
    confidence_score: clampConfidence(confidence),
  };
}
