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
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://www.mangaportali.com';
const CHAPTER_PAGE_SIZE = 100;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const FILTERS: Filter[] = [
  {
    type: 'select',
    id: 'sort',
    label: 'Sıralama',
    options: [
      { label: 'En Yeni', value: 'new' },
      { label: 'Son Güncellenen', value: 'updated' },
      { label: 'Trend', value: 'trending' },
      { label: 'Popüler', value: 'popular' },
      { label: 'Puan', value: 'rating' },
      { label: 'A-Z', value: 'alpha' },
    ],
  },
  {
    type: 'select',
    id: 'type',
    label: 'Tür',
    options: [
      { label: 'Hepsi', value: '' },
      { label: 'Manga', value: 'manga' },
      { label: 'Manhwa', value: 'manhwa' },
      { label: 'Manhua', value: 'manhua' },
      { label: 'Webtoon', value: 'webtoon' },
    ],
  },
  {
    type: 'select',
    id: 'status',
    label: 'Durum',
    options: [
      { label: 'Hepsi', value: '' },
      { label: 'Devam Ediyor', value: 'ONGOING' },
      { label: 'Tamamlandı', value: 'COMPLETED' },
    ],
  },
  {
    type: 'select',
    id: 'genre',
    label: 'Kategori',
    options: [
      { label: 'Hepsi', value: '' },
      { label: 'Adaptasyon', value: 'adaptasyon' },
      { label: 'Aile', value: 'aile' },
      { label: 'Akademi', value: 'akademi' },
      { label: 'Aksiyon', value: 'aksiyon' },
      { label: 'Baba & Cocuk', value: 'baba-cocuk' },
      { label: 'Bilim Kurgu', value: 'bilim-kurgu' },
      { label: 'Buyu', value: 'buyu' },
      { label: 'Canavar', value: 'canavar' },
      { label: 'Cok Guclu', value: 'cok-guclu' },
      { label: 'Dahi', value: 'dahi' },
      { label: 'Deha', value: 'deha' },
      { label: 'Drama', value: 'drama' },
      { label: 'Ecchi', value: 'ecchi' },
      { label: 'Eglence', value: 'eglence' },
      { label: 'Fantastik', value: 'fantastik' },
      { label: 'Fantazi', value: 'fantazi' },
      { label: 'Geri Donen', value: 'geri-donen' },
      { label: 'Gerileme', value: 'gerileme' },
      { label: 'Gerilim', value: 'gerilim' },
      { label: 'Gizem', value: 'gizem' },
      { label: 'Gunluk Hayat', value: 'gunluk-hayat' },
      { label: 'Harem', value: 'harem' },
      { label: 'Hayatta Kalma', value: 'hayatta-kalma' },
      { label: 'Hayattan Kesitler', value: 'hayattan-kesitler' },
      { label: 'Hayvanlar', value: 'hayvanlar' },
      { label: 'Intikam', value: 'intikam' },
      { label: 'Isekai', value: 'isekai' },
      { label: 'Josei', value: 'josei' },
      { label: 'Karanlik', value: 'karanlik' },
      { label: 'Komedi', value: 'komedi' },
      { label: 'Korku', value: 'korku' },
      { label: 'Kule', value: 'kule' },
      { label: 'Macera', value: 'macera' },
      { label: 'Manga', value: 'manga' },
      { label: 'Manhwa', value: 'manhwa' },
      { label: 'Meka', value: 'meka' },
      { label: 'Modern', value: 'modern' },
      { label: 'Modern Hayat', value: 'modern-hayat' },
      { label: 'Murim', value: 'murim' },
      { label: 'Muzik', value: 'muzik' },
      { label: 'Okul', value: 'okul' },
      { label: 'Okul Hayati', value: 'okul-hayati' },
      { label: 'Psikoloji', value: 'psikoloji' },
      { label: 'Psikolojik', value: 'psikolojik' },
      { label: 'Reenkarnasyon', value: 'reenkarnasyon' },
      { label: 'Romantik', value: 'romantik' },
      { label: 'Romantizm', value: 'romantizm' },
      { label: 'Sanal Gerceklik', value: 'sanal-gerceklik' },
      { label: 'Seinen', value: 'seinen' },
      { label: 'Seytan', value: 'seytan' },
      { label: 'Shoujo', value: 'shoujo' },
      { label: 'Shounen', value: 'shounen' },
      { label: 'Sihir', value: 'sihir' },
      { label: 'Sistem', value: 'sistem' },
      { label: 'Superkahraman', value: 'superkahraman' },
      { label: 'Supernatural', value: 'supernatural' },
      { label: 'Tarihi', value: 'tarihi' },
      { label: 'Trajedi', value: 'trajedi' },
      { label: 'Vampir', value: 'vampir' },
      { label: 'Video Oyunlari', value: 'video-oyunlari' },
      { label: 'Villain', value: 'villain' },
      { label: 'Yandere', value: 'yandere' },
      { label: 'Zindan', value: 'zindan' },
    ],
  },
  {
    type: 'select',
    id: 'tag',
    label: 'Etiket',
    options: [
      { label: 'Hepsi', value: '' },
      { label: 'Aksiyon', value: 'aksiyon' },
      { label: 'Asiri Guclu', value: 'asiri-guclu' },
      { label: 'Avci', value: 'avci' },
      { label: 'Buyu', value: 'buyu' },
      { label: 'Buyucu', value: 'buyucu' },
      { label: 'Buyulu', value: 'buyulu' },
      { label: 'Canavar', value: 'canavar' },
      { label: 'Dahi Mc', value: 'dahi-mc' },
      { label: 'Dogaustu', value: 'dogaustu' },
      { label: 'Dovus Sanatlari', value: 'dovus-sanatlari' },
      { label: 'Fantastik', value: 'fantastik' },
      { label: 'Fantazi', value: 'fantazi' },
      { label: 'Gunluk Hayat', value: 'gunluk-hayat' },
      { label: 'Harem', value: 'harem' },
      { label: 'Isekai', value: 'isekai' },
      { label: 'Komedi', value: 'komedi' },
      { label: 'Korku', value: 'korku' },
      { label: 'Manga', value: 'manga' },
      { label: 'Manga Turkce', value: 'manga-turkce' },
      { label: 'Manhwa', value: 'manhwa' },
      { label: 'Manhwa Turkce', value: 'manhwa-turkce' },
      { label: 'Okul Hayati', value: 'okul-hayati' },
      { label: 'Psikolojik', value: 'psikolojik' },
      { label: 'Reenkarnasyon', value: 'reenkarnasyon' },
      { label: 'Romantik', value: 'romantik' },
      { label: 'Seviye Atlama', value: 'seviye-atlama' },
      { label: 'Sistem', value: 'sistem' },
      { label: 'Supernatural', value: 'supernatural' },
      { label: 'Trajedi', value: 'trajedi' },
      { label: 'Zindan', value: 'zindan' },
      { label: 'Zombi', value: 'zombi' },
    ],
  },
];

interface Named {
  name: string;
}

interface SeriesDto {
  slug: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  status?: string | null;
  genres?: { genre: Named }[];
  tags?: { tag: Named }[];
}

interface ChapterDto {
  id: string;
  slug: string;
  title: string;
  number: number;
  publishedAt: string;
  isEarlyAccessLocked: boolean;
}

interface Paged<T> {
  items: T[];
  page: number;
  totalPages: number;
}

async function api<T>(path: string): Promise<T> {
  const response = await http.get(`${BASE_URL}${path}`, { headers });
  return JSON.parse(response.body) as T;
}

const toSummary = (dto: SeriesDto): MangaSummary => ({
  url: `/series/${dto.slug}`,
  title: dto.title,
  thumbnailUrl: dto.coverImageUrl ?? undefined,
});

const slugOf = (url: string) => url.replace(/^\/series\//, '').replace(/[/?#].*$/, '');
const text = (filters: FilterState, id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');

async function seriesPage(page: number, query: string, sort: string, filters: FilterState = {}): Promise<MangaPage> {
  const params = [
    ...(query ? [`search=${encodeURIComponent(query)}`] : []),
    `sort=${sort}`,
    ...(['type', 'status', 'genre', 'tag'] as const)
      .filter((id) => text(filters, id))
      .map((id) => `${id}=${encodeURIComponent(text(filters, id))}`),
    `page=${page}`,
  ];
  const result = await api<Paged<SeriesDto>>(`/api/series?${params.join('&')}`);
  return { items: result.items.map(toSummary), hasNextPage: result.page < result.totalPages };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => seriesPage(page, '', 'popular'),
    getLatest: (page) => seriesPage(page, '', 'updated'),
    getFilters: () => FILTERS,
    search: (query, page, filters) => seriesPage(page, query.trim(), text(filters, 'sort') || 'new', filters),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await api<SeriesDto>(`/api/series/${slugOf(manga.url)}`);
      const genres = [
        ...new Set([...(dto.genres ?? []).map((g) => g.genre.name), ...(dto.tags ?? []).map((t) => t.tag.name)]),
      ];
      const status: MangaStatus =
        dto.status === 'ONGOING' || dto.status === 'CURRENT'
          ? 'ongoing'
          : dto.status === 'COMPLETED'
            ? 'completed'
            : 'unknown';
      return {
        ...toSummary(dto),
        description: dto.description?.trim() || undefined,
        genres: genres.length ? genres : undefined,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const chapters: Chapter[] = [];
      for (let page = 1; ; page++) {
        const result = await api<Paged<ChapterDto>>(
          `/api/series/${slug}/chapters?pageSize=${CHAPTER_PAGE_SIZE}&page=${page}`,
        );
        for (const chapter of result.items) {
          if (chapter.isEarlyAccessLocked) continue;
          chapters.push({
            url: `/reader/${slug}/${chapter.slug}#${chapter.id}`,
            name: chapter.title,
            number: chapter.number,
            uploadedAt: Date.parse(chapter.publishedAt) || undefined,
          });
        }
        if (result.page >= result.totalPages) break;
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = chapter.url.slice(chapter.url.lastIndexOf('#') + 1);
      const result = await api<{ pages: { index: number; imageUrl: string }[] }>(`/api/chapters/${id}`);
      return result.pages
        .sort((a, b) => a.index - b.index)
        .map((page, index) => ({ index, imageUrl: absoluteUrl(BASE_URL, page.imageUrl) }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL).replace(/^www\./, '')
        ? { url: `/series/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url.replace(/#.*$/, '')),
  }),
});
