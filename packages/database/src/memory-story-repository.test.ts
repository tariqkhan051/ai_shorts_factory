import { describe, expect, it, beforeEach } from 'vitest';
import { createSampleScreenplay } from '@ai-shorts-factory/chatgpt-import';
import { MemoryProjectRepository } from './memory-project-repository.js';
import { MemoryStoryRepository } from './memory-story-repository.js';

describe('MemoryStoryRepository', () => {
  const projects = new MemoryProjectRepository();
  const stories = new MemoryStoryRepository(projects);
  const userId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    projects.clear();
    stories.clear();
  });

  it('imports a screenplay, keeps prior version on failed conceptual replace, and approves', async () => {
    const project = await projects.create(userId, {
      name: 'Neon',
      category: 'cinematic',
      input: {
        idea: 'Rainy neon chase',
        existing_story: '',
        additional_instructions: '',
        character_reference_notes: '',
      },
    });

    const first = await stories.importScreenplay(
      userId,
      project.id,
      createSampleScreenplay({ title: 'First Cut' }),
    );
    expect(first.current_version?.screenplay.title).toBe('First Cut');

    const afterImport = await projects.getById(userId, project.id);
    expect(afterImport?.workflow_state).toBe('STORY_APPROVAL');

    const second = await stories.importScreenplay(
      userId,
      project.id,
      createSampleScreenplay({ title: 'Second Cut' }),
    );
    expect(second.current_version?.screenplay.title).toBe('Second Cut');
    expect(second.current_version_id).not.toBe(first.current_version_id);

    const approved = await stories.approveStory(userId, project.id);
    expect(approved.approved_at).toBeTruthy();
    const finalProject = await projects.getById(userId, project.id);
    expect(finalProject?.workflow_state).toBe('SCENE_PREPARATION');
  });
});
