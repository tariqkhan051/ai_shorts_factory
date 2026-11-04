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
  });
});

describe('WORKFLOW_STATES', () => {
  it('includes terminal and intervention states', () => {
    expect(WORKFLOW_STATES).toContain('APPROVED');
    expect(WORKFLOW_STATES).toContain('NEEDS_HUMAN_INTERVENTION');
    expect(WORKFLOW_STATES).toContain('PAUSED');
  });
});

describe('PHASE', () => {
  it('reports the active delivery phase', () => {
    expect(PHASE.current).toBe(3);
    expect(PHASE.name).toMatch(/Credit Engine/i);
  });
});
