import { MockTtsProvider } from './mock-tts-provider.js';
import type { TtsProvider, TtsProviderStatus } from './types.js';

export type CreateTtsProviderOptions = {
  prefer?: 'mock' | 'none';
  spendEnabled?: boolean;
};

class UnconfiguredTtsProvider implements TtsProvider {
  readonly name = 'unconfigured';
  constructor(readonly status: TtsProviderStatus) {}
  async listVoices() {
    return [];
  }
  async synthesize(): Promise<never> {
    throw new Error(
      this.status === 'disabled_by_spend_gate'
        ? 'TTS spend is disabled (MATCH_TTS_SPEND_ENABLED defaults false).'
        : 'No TTS provider configured. Set MATCH_TTS_PROVIDER=mock for local previews.',
    );
  }
}

/**
 * Resolve TTS provider. Default is unconfigured unless MATCH_TTS_PROVIDER=mock
 * and spend gate allows (or mock bypass for local preview when spend not required).
 */
export function createTtsProvider(
  env: NodeJS.ProcessEnv = process.env,
  options: CreateTtsProviderOptions = {},
): TtsProvider {
  const spendEnabled =
    options.spendEnabled ??
    env.MATCH_TTS_SPEND_ENABLED?.trim().toLowerCase() === 'true';
  const prefer =
    options.prefer ??
    (env.MATCH_TTS_PROVIDER?.trim().toLowerCase() === 'mock' ? 'mock' : 'none');

  if (prefer === 'mock') {
    if (!spendEnabled && env.MATCH_TTS_ALLOW_MOCK_WITHOUT_SPEND !== 'true') {
      return new UnconfiguredTtsProvider('disabled_by_spend_gate');
    }
    return new MockTtsProvider();
  }
  return new UnconfiguredTtsProvider('unconfigured');
}
