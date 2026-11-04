import { describe, expect, it } from 'vitest';
import { describeFlowSessionStatus } from './flow-session-status.js';

describe('describeFlowSessionStatus', () => {
  it('reports NOT_CONFIGURED for mock', () => {
    const status = describeFlowSessionStatus({ FLOW_PROVIDER: 'mock' });
    expect(status.status).toBe('NOT_CONFIGURED');
    expect(status.provider).toBe('mock');
  });

  it('reports AUTHENTICATION_REQUIRED when runtime hint is set', () => {
    const status = describeFlowSessionStatus(
      {
        FLOW_PROVIDER: 'google-flow',
        FLOW_LIVE_ENABLED: 'true',
        FLOW_UI_VERIFIED: 'true',
        FLOW_BROWSER_PROFILE_DIR: './.flow-profile',
      },
      {
        runtimeHint: 'AUTHENTICATION_REQUIRED',
        runtimeMessage: 'Sign in manually',
      },
    );
    expect(status.status).toBe('AUTHENTICATION_REQUIRED');
  });
});
