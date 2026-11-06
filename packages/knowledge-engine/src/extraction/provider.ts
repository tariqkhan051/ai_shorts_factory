import type { ExtractedHero } from '../types.js';
import { parseFandomHeroHtml } from '../parsers/fandom-hero-html.js';
import { validateExtractedHero } from '../validation/record-validator.js';

/**
 * Provider-independent extraction layer.
 * Default implementation is deterministic (no paid AI credits).
 * Optional AI extractors may be injected but must return the same structured schema.
 */
export interface KnowledgeExtractionProvider {
  readonly name: string;
  extractHeroFromHtml(input: {
    title: string;
    html: string;
    sourceUrl: string;
  }): Promise<ExtractedHero>;
}

export class DeterministicExtractionProvider implements KnowledgeExtractionProvider {
  readonly name = 'deterministic-fandom-html';

  async extractHeroFromHtml(input: {
    title: string;
    html: string;
    sourceUrl: string;
  }): Promise<ExtractedHero> {
    const parsed = parseFandomHeroHtml(input);
    const validated = validateExtractedHero(parsed);
    if (!validated.ok) {
      throw new Error(`Invalid AI/deterministic extraction: ${validated.errors.join('; ')}`);
    }
    return validated.value;
  }
}

/**
 * Optional AI extraction stub — never called unless explicitly configured.
 * Keeps the architecture provider-independent without spending API credits by default.
 */
export class NoopAiExtractionProvider implements KnowledgeExtractionProvider {
  readonly name = 'noop-ai';

  async extractHeroFromHtml(): Promise<ExtractedHero> {
    throw new Error(
      'AI extraction disabled (noop). Enable a real provider only when configured; prefer deterministic parsers.',
    );
  }
}

export function createDefaultExtractionProvider(): KnowledgeExtractionProvider {
  return new DeterministicExtractionProvider();
}
