import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate } from './common/utils';

const BASE_URL = 'https://manga-tube.me';
const LATEST_PAGE_SIZE = 40;
const CHALLENGE_DELAY_MS = 1000;

interface Challenge {
  tk: string;
  arg1: string;
  arg2: string;
  arg3: string;
}

interface Cover {
  title: string;
  url: string;
  cover?: string;
}

interface Person {
  name: string;
}

interface ApiChapter {
  id: number;
  number: number;
  subNumber: number;
  volume: number;
  name?: string;
  publishedAt?: string;
}

interface ApiPage {
  url?: string;
  alt_source?: string;
  page: number;
}

const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' };

// The site hands out a cookie after a small arithmetic challenge; kept for the lifetime of the runtime.
const cookies: Record<string, string> = {};

const isChallengePage = (body: string) => body.includes('window.__challange') || body.includes('_challange =');

function storeCookies(responseHeaders: Record<string, string>) {
  const setCookie = Object.entries(responseHeaders).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1] ?? '';
  for (const m of setCookie.matchAll(/(?:^|[,\n]\s*)([\w-]+)=([^;,\n]*)/g)) cookies[m[1]!] = m[2]!;
}

const cookieHeader = () =>
  Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

function solve(arg1: string, arg2: string, op: string): string {
  const left = Number.parseInt(arg1, 16);
  const right = Number.parseInt(arg2, 16);
  const result = { a: left / right, b: left * right, c: left - right, d: left + right }[op];
  if (result === undefined) throw new Error(`Unknown challenge op: ${op}`);
  return String(result);
}

async function solveChallenge(body: string): Promise<void> {
  const payload = /_challange = (.+?);/.exec(body)?.[1];
  if (!payload) throw new Error('Challenge payload not found');
  const challenge = JSON.parse(payload) as Challenge;
  await timers.sleep(CHALLENGE_DELAY_MS);
  const response = await http.request({
    url: `${BASE_URL}/`,
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-challange-token': challenge.tk,
      'x-challange-arg1': challenge.arg1,
      'x-challange-arg2': challenge.arg2,
      'x-challange-arg3': challenge.arg3,
      'x-challange-arg4': solve(challenge.arg1, challenge.arg2, challenge.arg3),
    },
    body: '',
  });
  if (response.status >= 400) throw new Error(`Challenge validation failed: ${response.status}`);
  storeCookies(response.headers);
}

async function bootstrap(): Promise<void> {
  const response = await http.get(BASE_URL, { headers: { 'User-Agent': USER_AGENT } });
  storeCookies(response.headers);
  if (isChallengePage(response.body)) await solveChallenge(response.body);
}

async function api<T>(path: string, extra: Record<string, string> = {}): Promise<T> {
  if (!cookies.__mtbpass) await bootstrap();
  const request = () => http.get(`${BASE_URL}${path}`, { headers: { ...headers, ...extra, Cookie: cookieHeader() } });
  let response = await request();
  if (isChallengePage(response.body)) {
    await solveChallenge(response.body);
    response = await request();
  }
  storeCookies(response.headers);
  return JSON.parse(response.body) as T;
}

const mangaApiHeaders = (slug: string) => ({ Referer: `${BASE_URL}/series/${slug}`, 'Use-Parameter': 'manga_slug' });
const slugOf = (url: string) => url.substring(url.lastIndexOf('/') + 1);

const toSummary = (m: Cover): MangaSummary => ({ url: m.url, title: m.title, thumbnailUrl: m.cover || undefined });

const trimZero = (value: number) => String(value).replace(/\.0$/, '');

function toChapter(slug: string, c: ApiChapter): Chapter {
  let name = '';
  if (c.volume > 0) name += `Vol. ${trimZero(c.volume)} `;
  name += `Ch. ${trimZero(c.number)}`;
  if (c.subNumber > 0) name += `.${trimZero(c.subNumber)}`;
  if (c.name) name += ` - ${c.name}`;
  return {
    url: `/api/manga/${slug}/chapter/${c.id}`,
    name,
    number: c.number + (c.subNumber > 0 ? Number(`0.${trimZero(c.subNumber)}`) : 0),
    uploadedAt: parseDate(c.publishedAt, 'yyyy-MM-dd HH:mm:ss'),
  };
}

const STATUS: Record<number, MangaStatus> = { 1: 'ongoing', 2: 'completed' };

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const result = await api<{ data: { manga?: Cover[] } }>('/api/home/top-manga');
      return { items: (result.data.manga ?? []).map(toSummary), hasNextPage: false };
    },
    async getLatest(page): Promise<MangaPage> {
      const offset = (page - 1) * LATEST_PAGE_SIZE;
      const result = await api<{ data: { published?: { manga: Cover }[] } }>(`/api/home/updates?offset=${offset}`);
      const seen = new Set<string>();
      const items = (result.data.published ?? [])
        .map((entry) => toSummary(entry.manga))
        .filter((m) => !seen.has(m.url) && seen.add(m.url));
      return { items, hasNextPage: offset < LATEST_PAGE_SIZE * 2 };
    },
    async search(query): Promise<MangaPage> {
      const result = await api<{ data?: Cover[] }>(`/api/manga/quick-search?query=${encodeURIComponent(query)}`);
      return { items: (result.data ?? []).map(toSummary), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const slug = slugOf(manga.url);
      const result = await api<{
        data: { manga: Cover & { description?: string; status: number; author?: Person[]; artist?: Person[] } };
      }>(`/api/manga/${slug}`, mangaApiHeaders(slug));
      const m = result.data.manga;
      return {
        url: m.url,
        title: m.title,
        thumbnailUrl: m.cover || undefined,
        description: m.description || undefined,
        author: m.author?.map((a) => a.name).join(', ') || undefined,
        artist: m.artist?.map((a) => a.name).join(', ') || undefined,
        status: STATUS[m.status] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const result = await api<{ data: { chapters?: ApiChapter[] } }>(
        `/api/manga/${slug}/chapters`,
        mangaApiHeaders(slug),
      );
      return (result.data.chapters ?? []).map((c) => toChapter(slug, c));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const slug = chapter.url.startsWith('/api/manga/')
        ? chapter.url.substring('/api/manga/'.length).split('/chapter/')[0]!
        : chapter.url.substring('/series/'.length).split('/read/')[0]!;
      const apiPath = chapter.url.startsWith('/api/manga/')
        ? chapter.url
        : `/api/manga/${slug}/chapter/${chapter.url.split('/read/')[1]!.split('/')[0]}`;
      try {
        const result = await api<{ data: { chapter: { pages?: ApiPage[] } } }>(apiPath, mangaApiHeaders(slug));
        return (result.data.chapter.pages ?? [])
          .slice()
          .sort((a, b) => a.page - b.page)
          .map((p, index) => ({ index, imageUrl: p.url || p.alt_source }));
      } catch {
        return [];
      }
    },
    getWebUrl(item): string {
      const match = /^\/api\/manga\/([^/]+)\/chapter\/(\d+)/.exec(item.url);
      return match ? `${BASE_URL}/series/${match[1]}/read/${match[2]}` : `${BASE_URL}${item.url}`;
    },
    resolveUrl(url): MangaSummary | null {
      if (hostOf(url) !== hostOf(BASE_URL)) return null;
      const slug = /^https?:\/\/[^/]+\/series\/([^/?#]+)/i.exec(url)?.[1];
      return slug ? { url: `/series/${slug}`, title: slug } : null;
    },
  }),
});
