import { describe, expect, it } from 'vitest';
import { BUSINESS_DEFAULTS, PHASE } from './constants.js';
import { WORKFLOW_STATES } from './workflow-states.js';

describe('BUSINESS_DEFAULTS', () => {
  it('matches fixed daily production rules', () => {
    expect(BUSINESS_DEFAULTS.dailyFlowCreditBudget).toBe(50);
    expect(BUSINESS_DEFAULTS.sceneCount).toBe(5);
    expect(BUSINESS_DEFAULTS.estimatedCostPerScene).toBe(10);
    expect(BUSINESS_DEFAULTS.maxGenerationsPerProject).toBe(5);
    expect(BUSINESS_DEFAULTS.finalVideoMaxSeconds).toBe(59);
    expect(BUSINESS_DEFAULTS.defaultGenerationModel).toBe('Veo 3.1 - Lite');
  });
});

describe('WORKFLOW_STATES', () => {
  it('includes terminal and intervention states', () => {
    expect(WORKFLOW_STATES).toContain('APPROVED');
    expect(WORKFLOW_STATES).toContain('NEEDS_HUMAN_INTERVENTION');
    expect(WORKFLOW_STATES).toContain('PAUSED');
  });
});

describe('SCENE_STATES', () => {
  it('includes live-generation failure modes', async () => {
    const { SCENE_STATES, ASSET_ORIGINS, FLOW_SESSION_STATUSES } = await import(
      './workflow-states.js'
    );
    expect(SCENE_STATES).toContain('UNKNOWN_SUBMISSION');
    expect(SCENE_STATES).toContain('DOWNLOAD_FAILED');
    expect(SCENE_STATES).toContain('VERIFICATION_FAILED');
    expect(ASSET_ORIGINS).toEqual(['MOCK', 'REAL_GENERATED']);
    expect(FLOW_SESSION_STATUSES).toContain('AUTHENTICATION_REQUIRED');
  });
});

describe('PHASE', () => {
  it('reports the active delivery phase', () => {
    expect(PHASE.current).toBe(7);
    expect(PHASE.name).toMatch(/Hardening/i);
  });
});
