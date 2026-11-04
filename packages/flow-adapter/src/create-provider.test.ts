import { describe, expect, it } from 'vitest';
import { createVideoGenerationProvider } from './create-provider.js';
import { describeFlowProviderStatus } from './flow-status.js';
import { MockVideoGenerationProvider } from './mock-provider.js';

describe('createVideoGenerationProvider', () => {
  it('defaults to mock', () => {
    const provider = createVideoGenerationProvider({
      env: { FLOW_PROVIDER: 'mock', NODE_ENV: 'test' },
    });
    expect(provider).toBeInstanceOf(MockVideoGenerationProvider);
  });

  it('reports closed live gates by default', () => {
    const status = describeFlowProviderStatus({
      FLOW_PROVIDER: 'mock',
      NODE_ENV: 'development',
    });
    expect(status.gatesOk).toBe(false);
    expect(status.provider).toBe('mock');
  });

  it('refuses to construct live provider under NODE_ENV=test', () => {
    expect(() =>
      createVideoGenerationProvider({
        env: {
          FLOW_PROVIDER: 'google-flow',
          FLOW_LIVE_ENABLED: 'true',
          NODE_ENV: 'test',
        },
      }),
    ).toThrow(/Refusing live FLOW_PROVIDER/i);
  });
});
