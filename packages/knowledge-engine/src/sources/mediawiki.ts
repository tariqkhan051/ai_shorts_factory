import type { PoliteFetchClient } from '../http/fetch-client.js';
import { isUrlAllowedByRobots } from '../http/robots.js';

export type MediaWikiCategoryMember = {
  pageid: number;
  title: string;
};

export async function listCategoryMembers(
  client: PoliteFetchClient,
  apiUrl: string,
  categoryTitle: string,
  limit = 500,
): Promise<MediaWikiCategoryMember[]> {
  const robots = await isUrlAllowedByRobots(client, apiUrl);
  if (!robots.allowed) {
    throw new Error(`MediaWiki API blocked by robots.txt: ${robots.reason}`);
  }

  const members: MediaWikiCategoryMember[] = [];
  let continueToken: string | undefined;
  while (members.length < limit) {
    const url = new URL(apiUrl);
    url.searchParams.set('action', 'query');
    url.searchParams.set('list', 'categorymembers');
    url.searchParams.set('cmtitle', categoryTitle);
    url.searchParams.set('cmlimit', String(Math.min(50, limit - members.length)));
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    if (continueToken) url.searchParams.set('cmcontinue', continueToken);

    const res = await client.get(url.toString());
    if (!res.ok) {
      throw new Error(`MediaWiki category query failed (${res.status}) for ${categoryTitle}`);
    }
    const json = JSON.parse(res.text) as {
      query?: { categorymembers?: MediaWikiCategoryMember[] };
      continue?: { cmcontinue?: string };
    };
    const batch = json.query?.categorymembers ?? [];
    members.push(...batch.filter((m) => m.pageid > 0 && !m.title.includes(':')));
    continueToken = json.continue?.cmcontinue;
    if (!continueToken || batch.length === 0) break;
  }
  return members.slice(0, limit);
}

export async function parsePageHtml(
  client: PoliteFetchClient,
  apiUrl: string,
  title: string,
): Promise<{ title: string; html: string; pageid: number | null }> {
  const robots = await isUrlAllowedByRobots(client, apiUrl);
  if (!robots.allowed) {
    throw new Error(`MediaWiki parse blocked by robots.txt: ${robots.reason}`);
  }
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', title);
  url.searchParams.set('prop', 'text');
  url.searchParams.set('format', 'json');
  url.searchParams.set('disabletoc', '1');
  url.searchParams.set('origin', '*');

  const res = await client.get(url.toString());
  if (!res.ok) {
    throw new Error(`MediaWiki parse failed (${res.status}) for ${title}`);
  }
  const json = JSON.parse(res.text) as {
    parse?: { title?: string; pageid?: number; text?: { '*': string } };
    error?: { info?: string };
  };
  if (json.error?.info) {
    throw new Error(`MediaWiki parse error for ${title}: ${json.error.info}`);
  }
  return {
    title: json.parse?.title ?? title,
    html: json.parse?.text?.['*'] ?? '',
    pageid: json.parse?.pageid ?? null,
  };
}

export function wikiPageUrl(baseWikiUrl: string, title: string): string {
  const base = baseWikiUrl.endsWith('/') ? baseWikiUrl : `${baseWikiUrl}/`;
  return `${base}wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}
