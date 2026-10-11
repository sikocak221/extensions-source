import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://mangeek.app';
const API_URL = 'http://geekstations.com.br/api/v2/pt';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface MangaDto {
  id: number;
  title: string;
  alternative_title?: string | null;
  description: string;
  tags: string[];
  thumbnail: string;
  finished?: boolean | null;
  chapters?: { id: number; title: string }[];
}
interface HomeDto {
  tops: MangaDto[];
  trending: MangaDto[];
  news: { manga: MangaDto }[];
  reading: { manga: MangaDto }[];
  categories: { list: MangaDto[] }[];
  tags?: string[];
}

const normalizeImage = (url: string) =>
  url.replace(/^https?:\/\/51\.79\.78\.152/, 'https://static.geekstations.com.br');

/** Requests are signed with the time of the server (its Date header), so recorded fixtures replay. */
async function serverTime(): Promise<number> {
  try {
    const response = await http.request({ url: `${BASE_URL}/`, method: 'HEAD', headers });
    const date = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'date')?.[1];
    const time = date ? Date.parse(date) : Number.NaN;
    if (Number.isFinite(time)) return time;
  } catch (error) {
    log.warn('Cannot read the server time', error);
  }
  return Date.now();
}

async function signedUrl(route: string, input?: string): Promise<string> {
  const nonce = (await serverTime()).toString(16).toUpperCase();
  const key = crypto.md5(`M<${input ?? nonce}#MANG33K>D`);
  return `${API_URL}/${route}/${nonce}/${input === undefined ? '' : `${encodeURIComponent(input)}/`}${key}`;
}

async function get<T>(route: string, input?: string): Promise<T> {
  return (await http.get<T>(await signedUrl(route, input), { headers, responseType: 'json' })).body;
}

async function post<T>(route: string, input: string | undefined, tags: string[]): Promise<T> {
  return (await http.post<T>(await signedUrl(route, input), { json: { tags } }, { headers, responseType: 'json' }))
    .body;
}

const fetchHome = () => get<HomeDto>('home');

const idOf = (url: string) => url.split('/').pop() ?? '';

const summary = (m: MangaDto): MangaSummary => ({
  url: `/manga/${m.id}`,
  title: m.title,
  thumbnailUrl: normalizeImage(m.thumbnail),
});

const distinct = (mangas: MangaDto[]) => {
  const seen = new Set<number>();
  return mangas.filter((m) => !seen.has(m.id) && seen.add(m.id));
};

const page = (mangas: MangaDto[]): MangaPage => ({ items: distinct(mangas).map(summary), hasNextPage: false });

async function popular(): Promise<MangaPage> {
  const home = await fetchHome();
  return page([
    ...home.tops,
    ...home.trending,
    ...home.news.map((n) => n.manga),
    ...home.reading.map((n) => n.manga),
    ...home.categories.flatMap((c) => c.list),
  ]);
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: popular,
    async getLatest(): Promise<MangaPage> {
      return page((await fetchHome()).news.map((n) => n.manga));
    },
    async getFilters(): Promise<Filter[]> {
      const tags = (await fetchHome().catch(() => undefined))?.tags ?? [];
      if (!tags.length) return [];
      return [
        {
          type: 'group',
          id: 'tags',
          label: 'Tags',
          filters: tags.map((t): Filter => ({ type: 'checkbox', id: `tag.${t}`, label: t })),
        },
      ];
    },
    async search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      const normalized = query.trim().toLowerCase();
      const tags = Object.entries(filters)
        .filter(([id, v]) => id.startsWith('tag.') && v === true)
        .map(([id]) => id.slice(4));
      if (!normalized && tags.length === 0) return popular();
      const mangas = normalized
        ? await post<MangaDto[]>('search', normalized, tags)
        : await post<MangaDto[]>('discover', undefined, tags);
      return page(mangas);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await get<MangaDto>('manga', idOf(manga.url));
      const alt = dto.alternative_title?.trim();
      const description =
        (alt && alt.toLowerCase() !== dto.title.toLowerCase() ? `Título alternativo: ${alt}\n\n` : '') +
        dto.description;
      return {
        ...summary(dto),
        description,
        genres: dto.tags,
        status: dto.finished === true ? 'completed' : dto.finished === false ? 'ongoing' : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const dto = await get<MangaDto>('manga', idOf(manga.url));
      return [...(dto.chapters ?? [])].reverse().map((c) => {
        const number = /\d+(?:[.,]\d+)?/.exec(c.title)?.[0]?.replace(',', '.');
        return { url: `/chapter/${c.id}`, name: c.title, number: number ? Number(number) : undefined };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const fetchPages = async (route: string) =>
        (await get<{ pages: string[] }>(route, idOf(chapter.url))).pages.map((p, index) => ({
          index,
          imageUrl: normalizeImage(p),
        }));
      const primary = await fetchPages('chapter').catch(() => []);
      return primary.length ? primary : fetchPages('mirror');
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
