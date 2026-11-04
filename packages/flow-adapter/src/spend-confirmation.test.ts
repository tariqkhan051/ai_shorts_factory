import { describe, expect, it } from 'vitest';
import {
  assertLiveSpendConfirmation,
  createLiveSpendConfirmation,
  LIVE_SPEND_CONFIRM_PHRASE,
} from './spend-confirmation.js';

describe('spend confirmation', () => {
  it('requires exact phrase and matching token/scene', () => {
    const confirmation = createLiveSpendConfirmation({
      projectId: 'p1',
      sceneNumber: 1,
      prompt: 'neon alley',
      model: 'gemini-omni-flash',
      aspectRatio: '9:16',
      resolution: '720p',
      durationSeconds: 6,
      estimatedCreditCost: 'unknown',
    });

    expect(() =>
      assertLiveSpendConfirmation({
        confirmation,
        projectId: 'p1',
        sceneNumber: 1,
        typedPhrase: LIVE_SPEND_CONFIRM_PHRASE,
        providedToken: confirmation.token,
      }),
    ).not.toThrow();

    expect(() =>
      assertLiveSpendConfirmation({
        confirmation,
        projectId: 'p1',
        sceneNumber: 1,
        typedPhrase: 'yes',
        providedToken: confirmation.token,
      }),
    ).toThrow(/SPEND_REAL_CREDITS/);
  });
});
