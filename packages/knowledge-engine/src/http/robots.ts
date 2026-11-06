import type { PoliteFetchClient } from './fetch-client.js';

type RobotsRules = {
  fetchedAt: string;
  disallow: string[];
  allow: string[];
  crawlDelaySeconds: number | null;
};

const cache = new Map<string, RobotsRules | null>();

function pathAllowed(pathname: string, rules: RobotsRules): boolean {
  for (const allow of rules.allow) {
    if (pathname.startsWith(allow)) return true;
  }
  for (const disallow of rules.disallow) {
    if (disallow === '/') return false;
    if (disallow && pathname.startsWith(disallow)) return false;
  }
  return true;
}

/**
 * Minimal robots.txt parser for User-agent: * rules.
 * Missing robots.txt → allow (with caution); 404 → allow.
 */
export async function isUrlAllowedByRobots(
  client: PoliteFetchClient,
  url: string,
): Promise<{ allowed: boolean; reason: string; crawlDelaySeconds: number | null }> {
  const parsed = new URL(url);
  const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
  let rules = cache.get(parsed.host);
  if (rules === undefined) {
    try {
      const res = await client.get(robotsUrl);
      if (!res.ok) {
        cache.set(parsed.host, null);
        rules = null;
      } else {
        rules = parseRobots(res.text);
        cache.set(parsed.host, rules);
      }
    } catch {
      cache.set(parsed.host, null);
      rules = null;
    }
  }

  if (!rules) {
    return { allowed: true, reason: 'robots.txt missing or unreadable — proceeding cautiously', crawlDelaySeconds: null };
  }
  const allowed = pathAllowed(parsed.pathname, rules);
  return {
    allowed,
    reason: allowed ? 'allowed by robots.txt' : `disallowed by robots.txt for ${parsed.pathname}`,
    crawlDelaySeconds: rules.crawlDelaySeconds,
  };
}

function parseRobots(text: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  let inStar = false;
  const disallow: string[] = [];
  const allow: string[] = [];
  let crawlDelaySeconds: number | null = null;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith('user-agent:')) {
      const agent = line.slice('user-agent:'.length).trim().toLowerCase();
      inStar = agent === '*';
      continue;
    }
    if (!inStar) continue;
    if (lower.startsWith('disallow:')) {
      disallow.push(line.slice('disallow:'.length).trim());
    } else if (lower.startsWith('allow:')) {
      allow.push(line.slice('allow:'.length).trim());
    } else if (lower.startsWith('crawl-delay:')) {
      const n = Number(line.slice('crawl-delay:'.length).trim());
      if (!Number.isNaN(n)) crawlDelaySeconds = n;
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    disallow,
    allow,
    crawlDelaySeconds,
  };
}

export function clearRobotsCache(): void {
  cache.clear();
}
