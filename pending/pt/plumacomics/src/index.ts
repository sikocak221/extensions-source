import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, findRscObject, hostOf } from './common/utils';

const BASE_URL = 'https://plumacomics.cloud';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface SeriesDto {
  id: number;
  title: string;
  slug: string;
  status?: string | null;
  coverPath?: string | null;
}
interface ChapterDto {
  id: number;
  number: number;
  title?: string | null;
  isVipOnly: boolean;
  publishedAt?: string | null;
}

async function page(url: string): Promise<string> {
  return (await http.get(url, { headers })).body;
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(BASE_URL + path, { headers, responseType: 'json' })).body;
}

// A series is identified by its slug (the chapter list comes from the title page).
const summary = (s: SeriesDto): MangaSummary => ({
  url: `/title/${s.slug}`,
  title: s.title,
  thumbnailUrl: s.coverPath?.trim() ? `${BASE_URL}/api/cover/${s.coverPath.replace(/^\/+|\/+$/g, '')}` : undefined,
});

async function list(page: number, query: string, extra: string[]): Promise<MangaPage> {
  const params = [`page=${page}`, ...extra];
  if (query.trim()) params.push(`q=${encodeURIComponent(query)}`);
  const dto = await api<{ series: SeriesDto[]; page: number; totalPages: number }>(`/api/obras?${params.join('&')}`);
  return { items: dto.series.map(summary), hasNextPage: dto.page < dto.totalPages };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (p) => list(p, '', ['sort=popular']),
    getLatest: (p) => list(p, '', []),
    getFilters: (): Filter[] => [],
    search: (query: string, p: number, _filters: FilterState) => list(p, query, []),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = html.load(await page(BASE_URL + manga.url), { baseUrl: BASE_URL });
      const title = document.selectFirst('meta[property*=title]')?.attr('content') ?? manga.title;
      return {
        url: manga.url,
        title: title.includes('|') ? title.slice(0, title.lastIndexOf('|')).trim() : title,
        thumbnailUrl: document.selectFirst('img.object-cover')?.absUrl('src') || manga.thumbnailUrl,
        description: document.selectFirst('div p.text-neutral-300.text-sm')?.text().trim(),
        genres: document.select("a[href*='?genre=']").map((a) => a.text().trim()),
        status: 'unknown' as MangaStatus,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const body = await page(BASE_URL + manga.url);
      const dto = findRscObject<{ chapters: ChapterDto[] }>(body, (o) => Array.isArray(o.chapters));
      return (dto?.chapters ?? []).map((c) => {
        const time = c.publishedAt ? Date.parse(c.publishedAt) : Number.NaN;
        return {
          url: String(c.id),
          name: `${c.isVipOnly ? '🔒 ' : ''}${c.title ?? `Capítulo ${Math.trunc(c.number)}`}`,
          number: c.number,
          uploadedAt: Number.isNaN(time) ? undefined : time,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const result = await api<{ pages: { i: number; u: string }[] }>(`/api/viewer/bootstrap?c=${chapter.url}`);
      return result.pages.map((p) => ({ index: p.i, imageUrl: p.u.replace(/^\/+|\/+$/g, '') }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/title\/([^/?#]+)/i.exec(url.trim());
      return match && hostOf(BASE_URL).endsWith(match[1]!.toLowerCase())
        ? { url: `/title/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => ('name' in item ? `${BASE_URL}/read/${item.url}` : BASE_URL + item.url),
  }),
});
