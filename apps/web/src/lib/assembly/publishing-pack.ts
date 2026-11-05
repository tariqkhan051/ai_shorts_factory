export type PublishingPack = {
  title: string;
  description: string;
  tags: string[];
};

/** Normalize tags into `#hashtag` form without double-hashing. */
export function formatHashtags(tags: string[]): string {
  return tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag.replace(/\s+/g, '')}`))
    .join(' ');
}

export function formatPublishingPackText(pack: PublishingPack): string {
  const hashtags = formatHashtags(pack.tags);
  return [
    'Title',
    pack.title.trim() || '(untitled)',
    '',
    'Description',
    pack.description.trim() || '(no description)',
    '',
    'Hashtags',
    hashtags || '(none)',
    '',
  ].join('\n');
}

/** Safe download stem for Content-Disposition filenames. */
export function slugifyFilename(value: string, fallback = 'final-video'): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .toLowerCase();
  return slug || fallback;
}
