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
import { USER_AGENT, absoluteUrl, findRscObject, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://monomanga.com.tr';
const CDN_URL = 'https://cdn.monomanga.com.tr';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

// Select filters: genre, status, type, sort ("all" means no filter).
const FILTERS: Filter[] = [
  {
    type: 'select',
    id: 'genre',
    label: 'Tür',
    options: [
      { label: 'Tüm Türler', value: 'all' },
      { label: 'Aksiyon', value: '68845665ba4508edd90b6803' },
      { label: 'Bilim Kurgu', value: '68853016cca6c27536e02435' },
      { label: 'Büyü', value: '68845d2fba4508edd90b6a68' },
      { label: 'Doğaüstü', value: '6884586a3f93b2c335a7eb23' },
      { label: 'Dram', value: '6882b538a5832fa7b6621b33' },
      { label: 'Ecchi', value: '46a064824d4b459e9f424b9dcacd4e61' },
      { label: 'Fantazi', value: '6884575fa10f8fc8413aa59c' },
      { label: 'Gerilim', value: '6884edc3188dc5d95677291a' },
      { label: 'Gizem', value: '6884505d3f93b2c335a7ea7e' },
      { label: 'Harem', value: '68845af9ba4508edd90b69c3' },
      { label: 'Isekai', value: '68845d33e6987d135d824dbf' },
      { label: 'Josei', value: 'ead89dbbc1f54afd8f24deb6ef5ce0d1' },
      { label: 'Komedi', value: '6883b2c8cb54dd70c707be1f' },
      { label: 'Korku', value: '68845e89e6987d135d824e62' },
      { label: 'Macera', value: '68845758a10f8fc8413aa599' },
      { label: 'Okul Hayatı', value: '6883b2d4cb54dd70c707be25' },
      { label: 'One-Shot', value: '68845446ba4508edd90b67b2' },
      { label: 'Psikoloji', value: '6882b533a5832fa7b6621b30' },
      { label: 'Romantizm', value: '68844e5e3f93b2c335a7ea40' },
      { label: 'Seinen', value: '6882b53da5832fa7b6621b36' },
      { label: 'Shoujo', value: '68844f38ba4508edd90b675e' },
      { label: 'Shounen', value: '688451d63f93b2c335a7eaa6' },
      { label: 'Spor', value: '6883b2cecb54dd70c707be22' },
      { label: 'Tarihi', value: '6884566bba4508edd90b6806' },
      { label: 'Trajedi', value: '68845e84e6987d135d824e5f' },
      { label: 'Yaşamdan Kesitler', value: '6883b2dacb54dd70c707be28' },
      { label: 'Çıplaklık', value: '68844e4aba4508edd90b6750' },
    ],
  },
  {
    type: 'select',
    id: 'status',
    label: 'Durum',
    options: [
      { label: 'Tüm Durumlar', value: 'all' },
      { label: 'Devam Ediyor', value: 'ongoing' },
      { label: 'Tamamlandı', value: 'completed' },
      { label: 'Bırakıldı', value: 'dropped' },
      { label: 'Ara Verildi', value: 'hiatus' },
    ],
  },
  {
    type: 'select',
    id: 'type',
    label: 'Tip',
    options: [
      { label: 'Tüm Tipler', value: 'all' },
      { label: 'Manga', value: 'manga' },
      { label: 'Webtoon', value: 'webtoon' },
    ],
  },
  {
    type: 'select',
    id: 'sort',
    label: 'Sırala',
    options: [
      { label: 'En Yeni', value: 'newest' },
      { label: 'En Eski', value: 'oldest' },
      { label: 'A-Z', value: 'name_asc' },
      { label: 'Z-A', value: 'name_desc' },
      { label: 'En Çok Bölüm', value: 'most_chapters' },
    ],
  },
];

interface ChapterDto {
  chapterNumber?: number | null;
  title: string;
  slug: string;
  uploadDate?: string | null;
}

interface MangaDto {
  _id: string;
  name: string;
  slug: string;
  author?: string | null;
  artist?: string | null;
  summary?: string | null;
  coverImage?: string | null;
  status?: string | null;
  type?: string | null;
  genres?: { name: string }[] | null;
  volumes?: { startChapter: number; endChapter: number }[] | null;
}

interface MangaPageDto {
  manga: MangaDto;
  initialChapters?: ChapterDto[];
  initialHasMore?: boolean;
}

const image = (path: string) => (path.startsWith('http') ? path : `${CDN_URL}/${path}`);

async function rsc(path: string): Promise<string> {
  return (await http.get(absoluteUrl(BASE_URL, path), { headers: { ...headers, RSC: '1' } })).body;
}

async function list(query: string): Promise<MangaPage> {
  const response = await http.get(`${BASE_URL}/manga?${query}`, { headers });
  const document = html.load(response.body, { baseUrl: response.url });
  const items = document
    .select('article.manga-card')
    .filter((card) => !card.select('span').some((s) => s.text().toLowerCase() === 'novel'))
    .flatMap((card): MangaSummary[] => {
      const link = card.selectFirst('a');
      if (!link) return [];
      return [
        {
          url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
          title: card.selectFirst('h3')?.text() || link.attr('title') || '',
          thumbnailUrl: card.selectFirst('img')?.absUrl('src') || undefined,
        },
      ];
    });
  return {
    items,
    hasNextPage: document.select('nav[aria-label=Sayfalama] a[aria-label="Sonraki sayfa"]:not([disabled])').length > 0,
  };
}

const toChapter = (dto: ChapterDto, mangaSlug: string): Chapter => {
  const number = dto.chapterNumber ?? undefined;
  // Many chapters only carry a story title ("Son Söz") without the number.
  const name =
    number === undefined || /^bölüm/i.test(dto.title)
      ? dto.title
      : `Bölüm ${number}${dto.title.trim() ? `: ${dto.title}` : ''}`;
  return {
    url: `/manga/${mangaSlug}/${dto.slug}`,
    name,
    number,
    uploadedAt: Date.parse(dto.uploadDate ?? '') || undefined,
  };
};

async function mangaPage(url: string): Promise<MangaPageDto> {
  const dto = findRscObject<MangaPageDto>(await rsc(url), (value) => 'manga' in value && 'initialChapters' in value);
  if (!dto) throw new Error('Manga detayları ayıklanamadı');
  return dto;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`page=${page}&sort=most_chapters`),
    getLatest: (page) => list(`page=${page}&sort=newest`),
    getFilters: () => FILTERS,
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`page=${page}`];
      if (query) params.push(`search=${encodeURIComponent(query)}`);
      for (const id of ['genre', 'status', 'type']) {
        const value = filters[id];
        if (typeof value === 'string' && value !== 'all') params.push(`${id}=${encodeURIComponent(value)}`);
      }
      params.push(`sort=${typeof filters.sort === 'string' ? filters.sort : 'newest'}`);
      return list(params.join('&'));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { manga: dto } = await mangaPage(manga.url);
      const statuses: Record<string, MangaStatus> = {
        ongoing: 'ongoing',
        completed: 'completed',
        hiatus: 'hiatus',
        dropped: 'cancelled',
      };
      const genres = [
        ...(dto.genres ?? []).map((g) => g.name),
        ...(dto.type ? [dto.type.charAt(0).toUpperCase() + dto.type.slice(1)] : []),
      ];
      return {
        url: manga.url,
        title: dto.name,
        author: dto.author ?? undefined,
        artist: dto.artist ?? undefined,
        description: dto.summary ?? undefined,
        genres: genres.length ? genres : undefined,
        status: statuses[(dto.status ?? '').toLowerCase()] ?? 'unknown',
        thumbnailUrl: dto.coverImage ? image(dto.coverImage) : manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const dto = await mangaPage(manga.url);
      const slug = dto.manga.slug;
      const chapters = (dto.initialChapters ?? []).map((c) => toChapter(c, slug));
      if (!dto.initialHasMore) return chapters;
      const seen = new Set(chapters.map((c) => c.url));
      const add = (items: ChapterDto[]) => {
        for (const item of items) {
          const chapter = toChapter(item, slug);
          if (!seen.has(chapter.url)) {
            seen.add(chapter.url);
            chapters.push(chapter);
          }
        }
      };
      const api = async (query: string) => {
        const response = await http.get(`${BASE_URL}/api/manga/${dto.manga._id}/chapters?${query}`, { headers });
        return JSON.parse(response.body) as { data?: ChapterDto[]; hasMore?: boolean; nextOffset?: number | null };
      };
      if (dto.manga.volumes?.length) {
        // The site groups the remaining chapters by volumes.
        for (const volume of [...dto.manga.volumes].reverse()) {
          add((await api(`sort=desc&minChapter=${volume.startChapter}&maxChapter=${volume.endChapter}`)).data ?? []);
        }
      } else {
        let offset = chapters.length;
        for (let more = true; more;) {
          const result = await api(`sort=desc&limit=100&offset=${offset}`);
          add(result.data ?? []);
          more = result.hasMore ?? false;
          offset = result.nextOffset ?? offset + (result.data?.length ?? 0);
        }
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const dto = findRscObject<{ chapter: { content?: string[] } }>(
        await rsc(chapter.url),
        (value) =>
          typeof value.chapter === 'object' && value.chapter !== null && 'content' in (value.chapter as object),
      );
      if (!dto) throw new Error('Sayfa listesi ayıklanamadı');
      return (dto.chapter.content ?? []).map((img, index) => ({ index, imageUrl: image(img) }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+)\/?$/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
