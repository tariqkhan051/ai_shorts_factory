import { sleep } from '../util.js';

export type FetchClientOptions = {
  userAgent?: string;
  minIntervalMs?: number;
  timeoutMs?: number;
};

export type FetchResult = {
  ok: boolean;
  status: number;
  url: string;
  contentType: string | null;
  text: string;
  finalUrl: string;
};

/**
 * Polite HTTP client with per-host rate limiting and gzip support.
 * Does not bypass robots — callers must check robots when required.
 */
export class PoliteFetchClient {
  private readonly lastRequestByHost = new Map<string, number>();
  private readonly userAgent: string;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(options: FetchClientOptions = {}) {
    this.userAgent =
      options.userAgent ??
      'AI-Shorts-Factory-KnowledgeEngine/1.0 (+local; respectful-rate-limit; no-game-client)';
    this.minIntervalMs = options.minIntervalMs ?? 1500;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async get(url: string, init: RequestInit = {}): Promise<FetchResult> {
    const host = new URL(url).host;
    const last = this.lastRequestByHost.get(host) ?? 0;
    const wait = this.minIntervalMs - (Date.now() - last);
    if (wait > 0) await sleep(wait);

    this.lastRequestByHost.set(host, Date.now());
    const res = await fetch(url, {
      ...init,
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        ...(init.headers ?? {}),
      },
    });

    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url,
      contentType: res.headers.get('content-type'),
      text,
      finalUrl: res.url,
    };
  }
}
