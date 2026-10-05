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
import { USER_AGENT, absoluteUrl, hostOf, htmlToText } from './common/utils';

const BASE_URL = 'https://mangadiyari.com';
const PAGE_SIZE = 24;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES: [string, string][] = [
  ['Aksiyon', 'Action'],
  ['Macera', 'Adventure'],
  ['Komedi', 'Comedy'],
  ['Drama', 'Drama'],
  ['Fantastik', 'Fantasy'],
  ['Tarihi', 'Historical'],
  ['Korku', 'Horror'],
  ['Isekai', 'Isekai'],
  ['Dövüş Sanatları', 'Martial Arts'],
  ['Gizem', 'Mystery'],
  ['Reenkarnasyon', 'Reincarnation'],
  ['Romantik', 'Romance'],
  ['Okul', 'School'],
  ['Bilim Kurgu', 'Sci-Fi'],
  ['Doğaüstü', 'Supernatural'],
  ['Gerilim', 'Thriller'],
  ['Ecchi', 'Ecchi'],
  ['Harem', 'Harem'],
  ['Josei', 'Josei'],
  ['Yetişkin', 'Mature'],
  ['Mecha', 'Mecha'],
  ['Psikolojik', 'Psychological'],
  ['Seinen', 'Seinen'],
  ['Shoujo', 'Shoujo'],
  ['Shounen', 'Shounen'],
  ['Günlük Yaşam', 'Slice of Life'],
  ['Spor', 'Sports'],
  ['Trajedi', 'Tragedy'],
  ['Webtoon', 'Webtoon'],
  ['Manhwa', 'Manhwa'],
  ['Manhua', 'Manhua'],
];

interface SeriesDto {
  slug: string;
  title: string;
  cover_url?: string | null;
  description?: string | null;
  author?: string | null;
  artist?: string | null;
  status?: string | null;
  type?: string | null;
  genres?: string[];
  alt_names?: string | null;
}

interface ChapterDto {
  id: number;
  chapter_number: number;
  title?: string | null;
  publish_at?: string | null;
  created_at?: string | null;
}

async function api<T>(path: string): Promise<T> {
  const response = await http.get(`${BASE_URL}${path}`, { headers });
  return JSON.parse(response.body) as T;
}

const resolveImage = (src: string) =>
  src.startsWith('http') ? src : `${BASE_URL}${src.startsWith('/') ? '' : '/'}${src}`;

const toSummary = (dto: SeriesDto): MangaSummary => ({
  url: `/series/${dto.slug}`,
  title: dto.title,
  thumbnailUrl: dto.cover_url ? resolveImage(dto.cover_url) : undefined,
});

const slugOf = (url: string) => url.replace(/^\/series\//, '').replace(/[/?#].*$/, '');

async function seriesPage(
  page: number,
  query: string,
  sort: string,
  type = '',
  status = '',
  genres = '',
): Promise<MangaPage> {
  const params = [
    ...(query ? [`search=${encodeURIComponent(query)}`] : []),
    ...(genres ? [`genre=${encodeURIComponent(genres)}`] : []),
    `sort=${sort}`,
    ...(status ? [`status=${status}`] : []),
    ...(type ? [`type=${type}`] : []),
    `limit=${PAGE_SIZE}`,
    `page=${page}`,
  ];
  const result = await api<{ series: SeriesDto[]; hasMore: boolean }>(`/api/series?${params.join('&')}`);
  return { items: result.series.map(toSummary), hasNextPage: result.hasMore };
}

const text = (filters: FilterState, id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => seriesPage(page, '', 'popular'),
    async getLatest(page): Promise<MangaPage> {
      const result = await api<{ updates: SeriesDto[]; hasMore: boolean }>(
        `/api/series/latest-updates?limit=${PAGE_SIZE}&page=${page}`,
      );
      return { items: result.updates.map(toSummary), hasNextPage: result.hasMore };
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: 'Sıralama',
        options: [
          { label: 'Son Güncellenen', value: 'latest' },
          { label: 'En Popüler', value: 'popular' },
          { label: 'En Yüksek Puan', value: 'rating' },
          { label: 'A-Z', value: 'title' },
        ],
      },
      {
        type: 'select',
        id: 'type',
        label: 'Tür',
        options: [
          { label: 'Tümü', value: '' },
          { label: 'Manga', value: 'manga' },
          { label: 'Manhwa', value: 'manhwa' },
          { label: 'Manhua', value: 'manhua' },
          { label: 'Çizgi Roman', value: 'comic' },
        ],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Durum',
        options: [
          { label: 'Tümü', value: '' },
          { label: 'Devam Ediyor', value: 'ongoing' },
          { label: 'Tamamlandı', value: 'completed' },
          { label: 'Ara Verildi', value: 'hiatus' },
        ],
      },
      {
        type: 'group',
        id: 'genres',
        label: 'Kategoriler',
        filters: GENRES.map(([label, value]): Filter => ({ type: 'checkbox', id: `genre.${value}`, label })),
      },
    ],
    search: (query, page, filters) =>
      seriesPage(
        page,
        query.trim(),
        text(filters, 'sort') || 'latest',
        text(filters, 'type'),
        text(filters, 'status'),
        Object.entries(filters)
          .filter(([id, value]) => id.startsWith('genre.') && value === true)
          .map(([id]) => id.slice('genre.'.length))
          .join(','),
      ),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { series } = await api<{ series: SeriesDto }>(`/api/series/${slugOf(manga.url)}`);
      const statuses: Record<string, MangaStatus> = {
        ongoing: 'ongoing',
        completed: 'completed',
        hiatus: 'hiatus',
        cancelled: 'cancelled',
      };
      const description = [
        series.description ? htmlToText(series.description).trim() : '',
        series.alt_names?.trim() ? `Alternatif isimler: ${series.alt_names}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      const genres = [
        ...(series.type ? [series.type.charAt(0).toUpperCase() + series.type.slice(1)] : []),
        ...(series.genres ?? []),
      ];
      return {
        ...toSummary(series),
        author: series.author ?? undefined,
        artist: series.artist ?? undefined,
        description: description || undefined,
        genres: genres.length ? genres : undefined,
        status: statuses[series.status ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const details = await api<{ chapters: ChapterDto[] }>(`/api/series/${slug}`);
      return details.chapters
        .sort((a, b) => b.chapter_number - a.chapter_number)
        .map((chapter) => {
          const number = String(chapter.chapter_number);
          return {
            url: `/seri/${slug}/bolum/${number}#${chapter.id}`,
            name: chapter.title?.trim() || `Bölüm ${number}`,
            number: chapter.chapter_number,
            uploadedAt: Date.parse(chapter.publish_at ?? chapter.created_at ?? '') || undefined,
          };
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = chapter.url.slice(chapter.url.lastIndexOf('#') + 1);
      const result = await api<{ pages: { page_number: number; display_image: string }[] }>(`/api/chapters/${id}`);
      return result.pages
        .sort((a, b) => a.page_number - b.page_number)
        .map((page, index) => ({ index, imageUrl: resolveImage(page.display_image) }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:series|seri)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/series/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url.replace(/#.*$/, '')),
  }),
});
