import type { MatchEventType } from '@ai-shorts-factory/shared-types';
import type {
  MatchEventCandidate,
  MatchEventEvidence,
  MatchEventParticipant,
  MatchEventWindow,
} from '@ai-shorts-factory/validation';
import { matchHeroFromCatalog, type HeroCatalogEntry } from './match-analysis-hero-match.js';

export type DetectedEventSeed = {
  event_type: MatchEventType;
  timestamp_seconds: number;
  confidence: number;
  participants: MatchEventParticipant[];
  evidence: MatchEventEvidence[];
  notes?: string;
};

const KILL_PATTERNS: RegExp[] = [
  /^(.+?)\s+killed\s+(.+)$/i,
  /^(.+?)\s+slain\s+by\s+(.+)$/i,
  /^(.+?)\s+eliminated\s+(.+)$/i,
];

const TURTLE_PATTERNS: RegExp[] = [
  /\b(turtle)\b/i,
  /\bslain the turtle\b/i,
  /\bturtle has been slain\b/i,
];

const LORD_PATTERNS: RegExp[] = [
  /\b(lord)\b/i,
  /\bslain the lord\b/i,
  /\blord has been slain\b/i,
];

const TURRET_PATTERNS: RegExp[] = [
  /\b(turret|tower)\b/i,
  /\bdestroyed (a |the )?(turret|tower)\b/i,
];

const TEAMFIGHT_PATTERNS: RegExp[] = [
  /\bteam\s*fight\b/i,
  /\bace\b/i,
  /\btriple kill\b/i,
  /\bmaniac\b/i,
  /\bsavage\b/i,
];

function resolveHeroParticipant(
  raw: string,
  role: MatchEventParticipant['role'],
  catalog: HeroCatalogEntry[],
): MatchEventParticipant {
  const trimmed = raw.trim();
  const hero = matchHeroFromCatalog(trimmed, catalog);
  if (hero) {
    return {
      role,
      player_tag: null,
      hero_key: hero.hero_key,
      hero_name_raw: trimmed,
    };
  }
  // Fallback: treat as player tag when no hero match.
  return {
    role,
    player_tag: trimmed,
    hero_key: null,
    hero_name_raw: null,
  };
}

function detectTypeFromLine(line: string): MatchEventType | null {
  if (TEAMFIGHT_PATTERNS.some((re) => re.test(line))) return 'teamfight';
  if (LORD_PATTERNS.some((re) => re.test(line))) return 'lord';
  if (TURTLE_PATTERNS.some((re) => re.test(line))) return 'turtle';
  if (TURRET_PATTERNS.some((re) => re.test(line))) return 'turret';
  if (KILL_PATTERNS.some((re) => re.test(line))) return 'kill';
  return null;
}

function participantsForLine(
  line: string,
  eventType: MatchEventType,
  catalog: HeroCatalogEntry[],
): MatchEventParticipant[] {
  if (eventType === 'kill') {
    for (const pattern of KILL_PATTERNS) {
      const match = pattern.exec(line);
      if (!match) continue;
      if (/slain by/i.test(line)) {
        return [
          resolveHeroParticipant(match[2]!, 'actor', catalog),
          resolveHeroParticipant(match[1]!, 'target', catalog),
        ];
      }
      return [
        resolveHeroParticipant(match[1]!, 'actor', catalog),
        resolveHeroParticipant(match[2]!, 'target', catalog),
      ];
    }
  }
  return [];
}

/**
 * Parse kill-feed / announcement OCR text into event seeds at a frame timestamp.
 */
export function detectEventsFromOcrText(input: {
  text: string;
  timestampSeconds: number;
  evidence: MatchEventEvidence;
  catalog: HeroCatalogEntry[];
}): DetectedEventSeed[] {
  const lines = input.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const seeds: DetectedEventSeed[] = [];
  for (const line of lines) {
    const eventType = detectTypeFromLine(line);
    if (!eventType) continue;
    const baseConfidence = input.evidence.ocr_confidence ?? 0.6;
    const confidence =
      eventType === 'kill' ? Math.min(1, baseConfidence + 0.1) : Math.min(1, baseConfidence);
    seeds.push({
      event_type: eventType,
      timestamp_seconds: input.timestampSeconds,
      confidence,
      participants: participantsForLine(line, eventType, input.catalog),
      evidence: [{ ...input.evidence, ocr_text: line }],
      notes: '',
    });
  }
  return seeds;
}

export function buildEventWindows(input: {
  timestampSeconds: number;
  preSeconds: number;
  mainSeconds: number;
  postSeconds: number;
}): MatchEventWindow[] {
  const mainStart = Math.max(0, input.timestampSeconds);
  const mainEnd = mainStart + input.mainSeconds;
  const preStart = Math.max(0, mainStart - input.preSeconds);
  return [
    { phase: 'pre', start_seconds: preStart, end_seconds: mainStart },
    { phase: 'main', start_seconds: mainStart, end_seconds: mainEnd },
    { phase: 'post', start_seconds: mainEnd, end_seconds: mainEnd + input.postSeconds },
  ];
}

/**
 * Deduplicate near-identical events (same type within epsilon seconds).
 * Keeps the higher-confidence candidate.
 */
export function dedupeEventSeeds(
  seeds: DetectedEventSeed[],
  epsilonSeconds = 1.5,
): DetectedEventSeed[] {
  const sorted = [...seeds].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
  const kept: DetectedEventSeed[] = [];
  for (const seed of sorted) {
    const existing = kept.find(
      (item) =>
        item.event_type === seed.event_type &&
        Math.abs(item.timestamp_seconds - seed.timestamp_seconds) <= epsilonSeconds,
    );
    if (!existing) {
      kept.push(seed);
      continue;
    }
    if (seed.confidence > existing.confidence) {
      existing.timestamp_seconds = seed.timestamp_seconds;
      existing.confidence = seed.confidence;
      existing.participants = seed.participants;
      existing.evidence = [...existing.evidence, ...seed.evidence];
      existing.notes = seed.notes ?? existing.notes;
    } else {
      existing.evidence = [...existing.evidence, ...seed.evidence];
    }
  }
  return kept;
}

export function toMatchEventCandidate(
  seed: DetectedEventSeed,
  windows: MatchEventWindow[],
  id: string,
): MatchEventCandidate {
  return {
    id,
    event_type: seed.event_type,
    timestamp_seconds: seed.timestamp_seconds,
    confidence: seed.confidence,
    participants: seed.participants,
    evidence: seed.evidence,
    windows,
    notes: seed.notes ?? '',
    rejected: false,
    source: 'detector',
  };
}
