import { describe, expect, it } from 'vitest';
import { createProjectSchema, formatProjectErrors, updateProjectSchema } from './project.js';

describe('createProjectSchema', () => {
  it('accepts a valid project with idea', () => {
    const result = createProjectSchema.safeParse({
      name: 'Neon Courier',
      category: 'cinematic',
      visual_style: 'realistic_cinematic',
      language: 'en',
      target_audience: 'adults',
      input: {
        idea: 'A courier delivers a whispering package through rain.',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty idea', () => {
    const result = createProjectSchema.safeParse({
      name: 'Broken',
      category: 'other',
      input: { idea: '   ' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatProjectErrors(result.error).join(' ')).toMatch(/idea/i);
    }
  });
});

describe('updateProjectSchema', () => {
  it('allows partial updates', () => {
    const result = updateProjectSchema.safeParse({
      name: 'Renamed',
      input: { additional_instructions: 'Keep faces readable' },
    });
    expect(result.success).toBe(true);
  });
});
