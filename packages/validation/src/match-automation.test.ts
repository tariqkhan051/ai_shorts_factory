import { describe, expect, it } from 'vitest';
import {
  KB_ARTIFACT_SYNC_SCHEMA_VERSION,
  parseKbArtifactSyncManifest,
} from './kb-artifact-sync.js';
import { emptyMatchSpendFlags, readMatchSpendFlagsFromEnv } from './match-automation.js';

describe('match automation validation', () => {
  it('defaults all spend flags to false', () => {
    const flags = emptyMatchSpendFlags();
    expect(flags.paid_vision_enabled).toBe(false);
    expect(flags.tts_spend_enabled).toBe(false);
    expect(flags.allow_remote_artifact_fetch).toBe(false);
  });

  it('reads only explicit true from env', () => {
    const flags = readMatchSpendFlagsFromEnv({
      MATCH_PAID_VISION_ENABLED: 'true',
      MATCH_TTS_SPEND_ENABLED: 'yes',
      MATCH_ALLOW_REMOTE_ARTIFACT_FETCH: '1',
    } as NodeJS.ProcessEnv);
    expect(flags.paid_vision_enabled).toBe(true);
    expect(flags.tts_spend_enabled).toBe(false);
    expect(flags.allow_remote_artifact_fetch).toBe(false);
  });

  it('accepts a local-only kb artifact sync manifest', () => {
    const manifest = parseKbArtifactSyncManifest({
      schema_version: KB_ARTIFACT_SYNC_SCHEMA_VERSION,
      inbox_dir: 'assets/game-knowledge',
      artifacts: [{ path: 'assets/game-knowledge/mlbb-original-1.9.42.sample.json' }],
    });
    expect(manifest.artifacts).toHaveLength(1);
  });
});
