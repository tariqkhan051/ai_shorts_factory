import { describe, expect, it } from 'vitest';
import {
  isLiveFlowProviderName,
  readFlowLiveConfig,
  resolveFlowModelOptionLabel,
  resolveLiveMaxScenes,
} from './flow-live-config.js';

describe('flow-live-config', () => {
  it('defaults canary to one live scene', () => {
    const config = readFlowLiveConfig({
      FLOW_PROVIDER: 'google-flow',
      FLOW_LIVE_ENABLED: 'true',
      FLOW_CANARY_ONLY: 'true',
      FLOW_MAX_LIVE_SCENES_PER_PROJECT: '1',
    });
    expect(config.canaryOnly).toBe(true);
    expect(resolveLiveMaxScenes(config)).toBe(1);
    expect(isLiveFlowProviderName(config.provider)).toBe(true);
    expect(config.model).toBe('Veo 3.1 - Lite');
    expect(config.modelOptionLabel).toBe('Veo 3.1 - Lite');
  });

  it('lets DEFAULT_GENERATION_MODEL switch the canary model', () => {
    const config = readFlowLiveConfig({
      DEFAULT_GENERATION_MODEL: 'Veo 3.1 - Quality',
    });
    expect(config.model).toBe('Veo 3.1 - Quality');
    expect(config.modelOptionLabel).toBe('Veo 3.1 - Quality');
  });

  it('lets FLOW_MODEL_OPTION_LABEL override the UI menu label', () => {
    expect(
      resolveFlowModelOptionLabel({
        DEFAULT_GENERATION_MODEL: 'veo-lite',
        FLOW_MODEL_OPTION_LABEL: 'Veo 3.1 - Lite',
      }),
    ).toBe('Veo 3.1 - Lite');
  });

  it('falls back to recipe label when env model is unset', () => {
    expect(resolveFlowModelOptionLabel({}, 'Omni 1.1 Flash')).toBe('Omni 1.1 Flash');
  });

  it('unlocks five scenes only when canary is disabled', () => {
    const config = readFlowLiveConfig({
      FLOW_PROVIDER: 'google-flow',
      FLOW_LIVE_ENABLED: 'true',
      FLOW_CANARY_ONLY: 'false',
      FLOW_MAX_LIVE_SCENES_PER_PROJECT: '5',
    });
    expect(resolveLiveMaxScenes(config)).toBe(5);
  });

  it('keeps mock provider out of live max-scene rules', () => {
    const config = readFlowLiveConfig({ FLOW_PROVIDER: 'mock' });
    expect(resolveLiveMaxScenes(config)).toBe(5);
  });
});
