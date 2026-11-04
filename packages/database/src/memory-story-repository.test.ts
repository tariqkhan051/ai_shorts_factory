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

    await expect(stories.approveStory(userId, project.id)).rejects.toThrow(/characters as reviewed/i);
    await stories.markCharactersReviewed(userId, project.id);
    const approved = await stories.approveStory(userId, project.id);
    expect(approved.approved_at).toBeTruthy();
    const finalProject = await projects.getById(userId, project.id);
    expect(finalProject?.workflow_state).toBe('SCENE_PREPARATION');
  });

  it('patches screenplay content without clearing approval or workflow', async () => {
    const project = await projects.create(userId, {
      name: 'Patch',
      category: 'cinematic',
      input: {
        idea: 'Prompt fix',
        existing_story: '',
        additional_instructions: '',
        character_reference_notes: '',
      },
    });

    const sample = createSampleScreenplay({ title: 'Approved Cut' });
    await stories.importScreenplay(userId, project.id, sample);
    await stories.markCharactersReviewed(userId, project.id);
    const approved = await stories.approveStory(userId, project.id);
    expect(approved.approved_at).toBeTruthy();
    expect(approved.characters_reviewed_at).toBeTruthy();

    const patchedPrompt = 'Revised Flow prompt after rejection';
    const next = {
      ...sample,
      scenes: sample.scenes.map((scene, index) =>
        index === 0 ? { ...scene, flow_prompt: patchedPrompt } : scene,
      ),
    };
    const patched = await stories.patchCurrentScreenplayPreservingApproval(
      userId,
      project.id,
      next,
    );

    expect(patched.approved_at).toBe(approved.approved_at);
    expect(patched.characters_reviewed_at).toBe(approved.characters_reviewed_at);
    expect(patched.current_version?.screenplay.scenes[0]?.flow_prompt).toBe(patchedPrompt);
    expect(patched.current_version_id).not.toBe(approved.current_version_id);

    const after = await projects.getById(userId, project.id);
    expect(after?.workflow_state).toBe('SCENE_PREPARATION');
  });
});
