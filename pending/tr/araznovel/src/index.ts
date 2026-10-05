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
import { USER_AGENT, decodeEntities } from './common/utils';

const BASE_URL = 'https://manga.araznovel.com';
const API_URL = `${BASE_URL}/wp-json/aotori/v1/serie`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const THUMB_SIZE = /-\d+x\d+(?=\.\w+$)/;

const SORTS = [
  { label: 'Son güncellenen', value: 'latest' },
  { label: 'En yeni', value: 'new' },
  { label: 'Popüler', value: 'views' },
  { label: 'Puan', value: 'rating' },
];

interface SerieDto {
  id: number;
  title: string;
  url: string;
  thumbnail?: string | null;
}

interface TermDto {
  name: string;
}

interface DetailsDto {
  id: number;
  title: string;
  slug: string;
  description?: string | null;
  cover?: string | null;
  type?: string | null;
  status?: string | null;
  alternative?: string | null;
  genres?: TermDto[];
  authors?: TermDto[];
  artists?: TermDto[];
  chapters?: { id: number; name: string; slug: string; date?: string | null }[];
}

async function api<T>(url: string): Promise<T> {
  const response = await http.get(url, { headers });
  return JSON.parse(response.body) as T;
}

// The API wants the post id, the site the slug: urls keep both ("/series/<slug>?id=<id>").
const toSummary = (dto: SerieDto): MangaSummary => ({
  url: `/series/${dto.url.replace(/\/+$/, '').split('/').pop()}?id=${dto.id}`,
  title: decodeEntities(dto.title),
  thumbnailUrl: dto.thumbnail?.replace(THUMB_SIZE, ''),
});

const idOf = (url: string) => /[?&]id=(\d+)/.exec(url)?.[1] ?? '';
const slugOf = (url: string) => url.replace(/^\/series\//, '').replace(/[?/].*$/, '');

async function browse(page: number, orderBy: string): Promise<MangaPage> {
  const result = await api<{ items: SerieDto[]; has_more: boolean }>(`${API_URL}?orderby=${orderBy}&page=${page}`);
  return { items: result.items.map(toSummary), hasNextPage: result.has_more };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => browse(page, 'views'),
    getLatest: (page) => browse(page, 'latest'),
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Arama yaparken sıralama yok sayılır' },
      { type: 'select', id: 'sort', label: 'Sırala', options: SORTS },
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (!query.trim())
        return browse(page, typeof filters.sort === 'string' && filters.sort ? filters.sort : 'latest');
      const items = await api<SerieDto[]>(`${API_URL}/search?query=${encodeURIComponent(query)}`);
      return { items: items.map(toSummary), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await api<DetailsDto>(`${API_URL}/${idOf(manga.url)}`);
      const statuses: Record<string, MangaStatus> = {
        'on-going': 'ongoing',
        completed: 'completed',
        'on-hold': 'hiatus',
        canceled: 'cancelled',
        cancelled: 'cancelled',
      };
      const names = (terms?: TermDto[]) => terms?.map((t) => t.name).join(', ') || undefined;
      const description = [
        dto.description ? decodeEntities(dto.description).trim() : '',
        dto.alternative?.trim() ? `Alternatif isimler: ${dto.alternative}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      const genres = [
        ...(dto.type ? [dto.type.charAt(0).toUpperCase() + dto.type.slice(1)] : []),
        ...(dto.genres ?? []).map((g) => g.name),
      ];
      return {
        url: `/series/${dto.slug}?id=${dto.id}`,
        title: decodeEntities(dto.title),
        thumbnailUrl: dto.cover ?? manga.thumbnailUrl,
        author: names(dto.authors),
        artist: names(dto.artists),
        description: description || undefined,
        genres: genres.length ? genres : undefined,
        status: statuses[dto.status ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const dto = await api<DetailsDto>(`${API_URL}/${idOf(manga.url)}`);
      return (dto.chapters ?? []).map((chapter) => ({
        url: `/series/${dto.slug}/${chapter.slug}/`,
        name: decodeEntities(chapter.name),
        // "yyyy-MM-dd HH:mm:ss", UTC
        uploadedAt: chapter.date ? Date.parse(`${chapter.date.replace(' ', 'T')}Z`) || undefined : undefined,
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(`${BASE_URL}${chapter.url}`, { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      if (document.selectFirst('.cf-turnstile, .g-recaptcha'))
        throw new Error('İnsan doğrulaması gerekiyor, bölümü tarayıcıda açın');
      // data-src is the base64 of an expiring proxy url whose `u` parameter is the base64 of the image url.
      return document.select('.ao-reader-images__img[data-src]').flatMap((element, index): Page[] => {
        const proxy = base64.decode(element.attr('data-src') ?? '');
        const encoded = /[?&]u=([^&]+)/.exec(proxy)?.[1];
        return encoded ? [{ index, imageUrl: base64.decode(decodeURIComponent(encoded)) }] : [];
      });
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url.replace(/\?.*$/, '')}`,
  }),
});
