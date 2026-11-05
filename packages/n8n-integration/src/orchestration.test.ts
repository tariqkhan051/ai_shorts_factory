import { describe, expect, it } from 'vitest';
import { MemoryOrchestrationStore } from './memory-delivery-store.js';
import { OrchestrationController } from './orchestration.js';

describe('OrchestrationController', () => {
  it('starts, pauses, resumes, and cancels without affecting app authority', async () => {
    const store = new MemoryOrchestrationStore();
    const controller = new OrchestrationController(store);

    const started = await controller.apply('p1', 'v1', 'start');
    expect(started.enabled).toBe(true);
    expect(started.status).toBe('running');
    expect(started.correlationId).toBeTruthy();

    const paused = await controller.apply('p1', 'v1', 'pause');
    expect(paused.status).toBe('paused');

    const resumed = await controller.apply('p1', 'v1', 'resume');
    expect(resumed.status).toBe('running');

    const cancelled = await controller.apply('p1', 'v1', 'cancel');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt).toBeTruthy();
  });

  it('tracks waiting states per scene', async () => {
    const store = new MemoryOrchestrationStore();
    const controller = new OrchestrationController(store);
    await controller.apply('p1', 'v1', 'start');
    const waiting = await controller.setWaiting('p1', 'v1', 'waiting_manual_generation', {
      sceneId: 's2',
      sceneNumber: 2,
    });
    expect(waiting.currentSceneNumber).toBe(2);
    expect(waiting.status).toBe('waiting_manual_generation');
  });
});
