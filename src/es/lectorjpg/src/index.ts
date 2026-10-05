import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate, relativeUrl } from './common/utils';
import { relativeDateEs } from './esdate';
import { GENRES } from './genres';

const BASE_URL = 'https://visorjpg.lat';
const API_URL = 'https://api.visorjpg.lat';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
// Latest updates page by cursor; the first cursor is "everything updated before" a date (a fixed far-future
// one, so requests don't depend on the clock).
const FIRST_LATEST_CURSOR = base64.encode('{"last_update_at":"2100-01-01 00:00:00","id":0,"_pointsToNextItems":true}');

interface SeriesQuery {
  data?: { name: string; slug: string; cover_url?: string | null }[];
  next_cursor?: string | null;
}

async function api(path: string): Promise<SeriesQuery> {
  return (await http.get<SeriesQuery>(API_URL + path, { headers, responseType: 'json' })).body;
}

/** Cursor for page n of a listing (key = listing + query), remembered from page n-1. */
const cursors = new Map<string, string>();
async function cursorFor(key: string, page: number, first: string): Promise<string | undefined> {
  if (page === 1) return first;
  const id = `cursor:${key}:${page}`;
  return cursors.get(id) ?? (await storage.get<string>(id)) ?? undefined;
}
async function remember(key: string, page: number, cursor: string | null | undefined): Promise<void> {
  if (!cursor) return;
  const id = `cursor:${key}:${page + 1}`;
  cursors.set(id, cursor);
  await storage.set(id, cursor);
}

function toPage(result: SeriesQuery): MangaPage {
  return {
    items: (result.data ?? []).map((s) => ({
      url: `/series/${s.slug}`,
      title: s.name,
      thumbnailUrl: s.cover_url || undefined,
    })),
    hasNextPage: Boolean(result.next_cursor),
  };
}

async function cursorListing(
  key: string,
  page: number,
  path: (cursor: string) => string,
  first: string,
): Promise<MangaPage> {
  const cursor = await cursorFor(key, page, first);
  if (cursor === undefined) return { items: [], hasNextPage: false };
  const result = await api(path(cursor));
  await remember(key, page, result.next_cursor);
  return toPage(result);
}

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      return { ...toPage(await api('/home/trending')), hasNextPage: false };
    },
    getLatest: (page) =>
      cursorListing(
        'latest',
        page,
        (c) => `/home/lastest-updates?cursor=${encodeURIComponent(c)}`,
        FIRST_LATEST_CURSOR,
      ),
    getFilters: (): Filter[] => [
      {
        type: 'group',
        id: 'genres',
        label: 'Géneros',
        filters: GENRES.map(([label, key]): Filter => ({ type: 'checkbox', id: `genre.${key}`, label })),
      },
    ],
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const genres = Object.entries(filters)
        .filter(([id, value]) => id.startsWith('genre.') && value === true)
        .map(([id]) => id.slice(6))
        .join(',');
      const params = `name=${encodeURIComponent(query)}${genres ? `&genres=${encodeURIComponent(genres)}` : ''}`;
      return cursorListing(`search:${params}`, page, (c) => `/search?cursor=${encodeURIComponent(c)}&${params}`, '');
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(BASE_URL + manga.url);
      const style = (document.selectFirst('div.bg_main.bg-cover')?.attr('style') ?? '').replace(/&quot;/g, '"');
      const cover = /url\(["']?([^"')]+)["']?\)/.exec(style)?.[1];
      const statusText = document
        .select('div.grid')
        .find((div) => div.select('span').some((span) => span.text().includes('Status')))
        ?.selectFirst('button')
        ?.text()
        .trim();
      const status: MangaStatus =
        statusText === 'En emisión'
          ? 'ongoing'
          : statusText === 'Completado'
            ? 'completed'
            : statusText === 'En pausa'
              ? 'hiatus'
              : 'unknown';
      return {
        url: manga.url,
        title: document.selectFirst('div.grid > h1')?.text() || manga.title,
        thumbnailUrl: cover || manga.thumbnailUrl,
        description:
          document
            .select('div.grid > div.container > p')
            .map((p) => p.text())
            .join(' ') || undefined,
        genres: document.select('a[href*="/series?genres"] > span').map((span) => span.text()),
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(BASE_URL + manga.url);
      return document.select('div.grid > a.group').map((a) => {
        const date = a.selectFirst('span.w-fit')?.text().trim();
        return {
          url: relativeUrl(a.absUrl('href') ?? ''),
          name: a.selectFirst('span.truncate')?.text() ?? '',
          uploadedAt: relativeDateEs(date) ?? parseDate(date, 'dd/MM/yyyy'),
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const body = (await http.get(BASE_URL + chapter.url, { headers })).body;
      const json = /images:(\[.*?\])/.exec(body)?.[1];
      return json ? (JSON.parse(json) as string[]).map((imageUrl, index) => ({ index, imageUrl })) : [];
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/series/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
