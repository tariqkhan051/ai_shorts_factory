import { describe, expect, it } from 'vitest';
import {
  formatHashtags,
  formatPublishingPackText,
  slugifyFilename,
} from './publishing-pack';

describe('publishing-pack', () => {
  it('formats hashtags and pack text', () => {
    expect(formatHashtags(['cinematic', '#sci-fi', ' short form '])).toBe(
      '#cinematic #sci-fi #shortform',
    );
    expect(
      formatPublishingPackText({
        title: 'Echoes in Neon',
        description: 'A courier delivers a whispering memory.',
        tags: ['cinematic', 'sci-fi'],
      }),
    ).toContain('Title\nEchoes in Neon');
  });

  it('slugifies filenames safely', () => {
    expect(slugifyFilename('Echoes in Neon!')).toBe('echoes-in-neon');
    expect(slugifyFilename('!!!')).toBe('final-video');
  });
});
