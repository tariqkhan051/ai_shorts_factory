import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryProjectRepository } from './memory-project-repository.js';

describe('MemoryProjectRepository', () => {
  const repo = new MemoryProjectRepository();
  const userId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    repo.clear();
  });

  it('creates, lists, updates, and soft-deletes a project', async () => {
    const created = await repo.create(userId, {
      name: 'Echoes',
      category: 'cinematic',
      visual_style: 'realistic_cinematic',
      language: 'en',
      target_audience: 'adults',
      notes: '',
      input: {
        idea: 'Rainy neon chase',
        existing_story: '',
        additional_instructions: '',
        character_reference_notes: '',
      },
    });

    expect(created.workflow_state).toBe('IDEA_SUBMITTED');
    expect(created.input?.idea).toBe('Rainy neon chase');

    const listed = await repo.listByUser(userId);
    expect(listed).toHaveLength(1);

    const updated = await repo.update(userId, created.id, {
      name: 'Echoes Revised',
      input: { idea: 'Updated idea' },
    });
    expect(updated.name).toBe('Echoes Revised');
    expect(updated.input?.idea).toBe('Updated idea');

    await repo.softDelete(userId, created.id);
    expect(await repo.listByUser(userId)).toHaveLength(0);
    expect(await repo.getById(userId, created.id)).toBeNull();
  });

  it('computes dashboard stats from workflow states', async () => {
    await repo.create(userId, {
      name: 'A',
      category: 'other',
      input: {
        idea: 'a',
        existing_story: '',
        additional_instructions: '',
        character_reference_notes: '',
      },
    });
    const stats = await repo.getDashboardStats(userId);
    expect(stats.projectsInProgress).toBe(1);
    expect(stats.completedVideos).toBe(0);
  });
});
