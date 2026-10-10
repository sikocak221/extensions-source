import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, findRscObject, hostOf, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://acervoeremita.com';
const headers = {
  'User-Agent': USER_AGENT,
  Referer: `${BASE_URL}/`,
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'Accept-Language': 'pt-BR,en-US;q=0.9,en;q=0.8',
};

interface WorkDto {
  workId: number;
  title: string;
  coverUrl: string;
  tagNames?: string[];
  slug: string;
}
interface ChapterDto {
  chapterId: number;
  chapterNumber: string;
  name: string;
  releasedAt: string;
}

const get = async (url: string) => (await http.get(url, { headers: { ...headers, Accept: 'text/html,*/*' } })).body;

async function list(url: string): Promise<MangaPage> {
  const body = await get(url);
  const dto = findRscObject<{ works: WorkDto[]; pagination: { hasMore?: boolean; hasNext?: boolean } }>(
    body,
    (v) => Array.isArray(v.works) && typeof v.pagination === 'object',
  );
  return {
    items: (dto?.works ?? []).map((w) => ({ url: `/work/${w.slug}`, title: w.title, thumbnailUrl: w.coverUrl })),
    hasNextPage: dto?.pagination.hasNext ?? dto?.pagination.hasMore ?? false,
  };
}

const slugOf = (url: string) => /\/work\/([^/?#]+)/.exec(url)?.[1] ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`${BASE_URL}/explore?page=${page}`),
    getLatest: (page) => list(`${BASE_URL}/explore?page=${page}&sort=release&dir=desc`),
    search: (query, page) => list(`${BASE_URL}/explore?page=${page}&q=${encodeURIComponent(query)}`),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = html.load(await get(BASE_URL + manga.url), { baseUrl: BASE_URL });
      return {
        url: manga.url,
        title: doc.selectFirst('h1')?.text() ?? manga.title,
        thumbnailUrl: selectIgnoreCase(doc, 'img[data-component*=cover]')[0]?.absUrl('src') ?? manga.thumbnailUrl,
        description: selectIgnoreCase(doc, 'p[data-component*=description]')[0]?.text(),
        genres: selectIgnoreCase(doc, '[data-component*=tags] > span').map((s) => s.text()),
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const body = await get(`${BASE_URL}/work/${slug}`);
      const id = findRscObject<{ workId: number }>(
        body,
        (v) => typeof v.workId === 'number' && !('works' in v),
      )?.workId;
      if (id === undefined) return [];
      const chapters: Chapter[] = [];
      for (let cursor = 0; ; cursor += 30) {
        const { body: dto } = await http.get<{
          chapters: ChapterDto[];
          pagination: { hasMore?: boolean; hasNext?: boolean };
        }>(`${BASE_URL}/api/work/chapters?workId=${id}&cursor=${cursor}&limit=30`, { headers, responseType: 'json' });
        for (const c of dto.chapters) {
          const time = Date.parse(c.releasedAt);
          chapters.push({
            url: `/work/${slug}/read?chapter=${c.chapterNumber}&page=1`,
            name: c.name,
            number: Number.parseFloat(c.chapterNumber) || undefined,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          });
        }
        if (!(dto.pagination.hasNext ?? dto.pagination.hasMore) || dto.chapters.length === 0) break;
      }
      return chapters.reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const doc = html.load(await get(BASE_URL + chapter.url), { baseUrl: BASE_URL });
      return selectIgnoreCase(doc, '[data-component*=ReaderScreen] > img').map((img, index) => ({
        index,
        imageUrl: img.absUrl('src') ?? '',
      }));
    },
    imageHeaders: () => ({
      ...headers,
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'same-origin',
    }),
    resolveUrl(url: string): MangaSummary | null {
      const slug = slugOf(url);
      return hostOf(url) === hostOf(BASE_URL) && slug ? { url: `/work/${slug}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + ('name' in item ? item.url : relativeUrl(item.url)),
  }),
});
