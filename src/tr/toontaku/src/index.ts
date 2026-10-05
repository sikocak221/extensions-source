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

const BASE_URL = 'https://toontaku.com';
const API_URL = `${BASE_URL}/api`;
const PAGE_SIZE = 24;
const LATEST_PAGE_SIZE = 60;
const CHAPTER_LIMIT = 2000;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface SeriesDto {
  slug: string;
  title: string;
  coverImageUrl?: string | null;
}

interface DetailsDto extends SeriesDto {
  id: string;
  description?: string | null;
  type: string;
  status: string;
  alternativeTitles?: string[];
  genres?: { name: string }[];
}

async function api<T>(path: string): Promise<T> {
  const response = await http.get(`${API_URL}${path}`, { headers });
  return (JSON.parse(response.body) as { data: T }).data;
}

const toSummary = (dto: SeriesDto): MangaSummary => ({
  url: `/seri/${dto.slug}`,
  title: dto.title,
  thumbnailUrl: dto.coverImageUrl ?? undefined,
});

const slugOf = (url: string) => url.replace(/^\/seri\//, '').replace(/[/?#].*$/, '');
const details = async (slug: string) => (await api<{ series: DetailsDto }>(`/series/slug/${slug}`)).series;

async function seriesPage(page: number, sort: string, extra: string[] = []): Promise<MangaPage> {
  // The site also hosts light novels (TEXT_CHAPTER).
  const params = [
    ...extra,
    `page=${page}`,
    `limit=${PAGE_SIZE}`,
    `sortBy=${sort.split(',')[0]}`,
    `sortOrder=${sort.split(',')[1]}`,
    'contentKind=IMAGE_CHAPTER',
  ];
  const data = await api<{ series: SeriesDto[]; page: number; totalPages: number }>(`/series?${params.join('&')}`);
  return { items: data.series.map(toSummary), hasNextPage: data.page < data.totalPages };
}

// /api/chapters/new is cursor-paginated: remember the cursor the previous page handed out.
let latestCursor: string | null | undefined;

const text = (filters: FilterState, id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => seriesPage(page, 'totalViews,desc'),
    async getLatest(page): Promise<MangaPage> {
      if (page === 1) latestCursor = null;
      if (page > 1 && !latestCursor) throw new Error('Sayfa bulunamadı, listeyi yenileyin');
      const data = await api<{
        items: { seriesSlug: string; seriesTitle: string; coverUrl?: string | null; contentKind: string }[];
        nextCursor?: string | null;
        isEnd: boolean;
      }>(`/chapters/new?limit=${LATEST_PAGE_SIZE}${page > 1 ? `&cursor=${encodeURIComponent(latestCursor!)}` : ''}`);
      latestCursor = data.nextCursor;
      const seen = new Set<string>();
      const items = data.items
        .filter((i) => i.contentKind === 'IMAGE_CHAPTER' && !seen.has(i.seriesSlug) && !!seen.add(i.seriesSlug))
        .map((i) => toSummary({ slug: i.seriesSlug, title: i.seriesTitle, coverImageUrl: i.coverUrl }));
      return { items, hasNextPage: !data.isEnd };
    },
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [
        {
          type: 'select',
          id: 'sort',
          label: 'Sıralama',
          options: [
            { label: 'Popülerlik', value: 'totalViews,desc' },
            { label: 'Yeni eklenen', value: 'createdAt,desc' },
            { label: 'A-Z', value: 'title,asc' },
          ],
        },
        {
          type: 'select',
          id: 'type',
          label: 'Tür',
          options: [
            { label: 'Tümü', value: '' },
            { label: 'Manga', value: 'MANGA' },
            { label: 'Manhwa', value: 'MANHWA' },
            { label: 'Manhua', value: 'MANHUA' },
          ],
        },
        {
          type: 'select',
          id: 'status',
          label: 'Durum',
          options: [
            { label: 'Tümü', value: '' },
            { label: 'Devam Ediyor', value: 'DEVAM_EDIYOR' },
            { label: 'Tamamlandı', value: 'TAMAMLANDI' },
            { label: 'Durakladı', value: 'DURAKLADI' },
            { label: 'Bırakıldı', value: 'BIRAKILDI' },
          ],
        },
        { type: 'checkbox', id: 'free', label: 'Sadece ücretsiz seriler' },
      ];
      try {
        const { genres } = await api<{ genres: { slug: string; name: string }[] }>('/filters');
        if (genres.length)
          filters.push({
            type: 'group',
            id: 'genres',
            label: 'Kategoriler',
            filters: genres.map((g): Filter => ({ type: 'checkbox', id: `genre.${g.slug}`, label: g.name })),
          });
      } catch {
        // The remaining filters work without the genre list.
      }
      return filters;
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const genres = Object.entries(filters)
        .filter(([id, value]) => id.startsWith('genre.') && value === true)
        .map(([id]) => id.slice('genre.'.length))
        .join(',');
      const extra = [
        ...(query.trim() ? [`search=${encodeURIComponent(query.trim())}`] : []),
        ...(text(filters, 'type') ? [`type=${text(filters, 'type')}`] : []),
        ...(text(filters, 'status') ? [`status=${text(filters, 'status')}`] : []),
        ...(genres ? [`includeGenres=${encodeURIComponent(genres)}`] : []),
        ...(filters.free === true ? ['onlyFree=true'] : []),
      ];
      return seriesPage(page, text(filters, 'sort') || 'totalViews,desc', extra);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await details(slugOf(manga.url));
      const statuses: Record<string, MangaStatus> = {
        DEVAM_EDIYOR: 'ongoing',
        TAMAMLANDI: 'completed',
        SONLANDI: 'completed',
        DURAKLADI: 'hiatus',
        BIRAKILDI: 'cancelled',
      };
      const description = [
        dto.description ? htmlToText(dto.description).trim() : '',
        dto.alternativeTitles?.length ? `Alternatif isimler: ${dto.alternativeTitles.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      return {
        ...toSummary(dto),
        description: description || undefined,
        genres: [dto.type.charAt(0) + dto.type.slice(1).toLowerCase(), ...(dto.genres ?? []).map((g) => g.name)],
        status: statuses[dto.status] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      // The chapter endpoint needs the internal series id, which only the details response has.
      const { id } = await details(slug);
      const data = await api<{
        chapters: { id: string; chapterNumber: number; title?: string | null; canRead: boolean; publishedAt: string }[];
      }>(`/chapters/series/${id}?limit=${CHAPTER_LIMIT}&sortBy=chapterNumber&sortOrder=desc`);
      return data.chapters.map((chapter) => {
        // Most titles are just "Chapter N" (sometimes with a date appended), which adds nothing.
        const title = chapter.title && !/^chapter /i.test(chapter.title) ? ` - ${chapter.title}` : '';
        return {
          url: `/seri/${slug}/bolum/${chapter.chapterNumber}#${chapter.id}${chapter.canRead ? '' : ':locked'}`,
          name: `${chapter.canRead ? '' : '🔒 '}Bölüm ${chapter.chapterNumber}${title}`,
          number: chapter.chapterNumber,
          uploadedAt: Date.parse(chapter.publishedAt) || undefined,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [id, locked] = chapter.url.slice(chapter.url.lastIndexOf('#') + 1).split(':');
      if (locked) throw new Error('Bu bölüm kilitli, açmak için sitede oturum açıp satın almanız gerekiyor');
      const data = await api<{ imageUrls: string[] }>(`/chapters/${id}?increment_view=false`);
      return data.imageUrls.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/seri\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL)
        ? { url: `/seri/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url.replace(/#.*$/, '')),
  }),
});
