import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { imageSize } from './image';
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://mangadenizi.net';
const API_URL = `${BASE_URL}/api/v1`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const apiHeaders = { ...headers, Accept: 'application/json', Referer: `${BASE_URL}/manga` };

// Select filters; their ids are the parameters of the listing API (status[], categories[], demographics[]).
const FILTERS: Filter[] = [
  {
    type: 'select',
    id: 'sort',
    label: 'Sıralama',
    options: [
      { label: 'Varsayılan', value: '' },
      { label: 'En Popüler', value: 'popular' },
      { label: 'Son Güncellenen', value: 'latest' },
      { label: 'En Yüksek Puan', value: 'rating' },
      { label: 'Alfabetik (A-Z)', value: 'name' },
      { label: 'Yıl (Yeni-Eski)', value: 'year' },
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
      { label: 'İptal Edildi', value: 'cancelled' },
    ],
  },
  {
    type: 'select',
    id: 'category',
    label: 'Kategori',
    options: [
      { label: 'Tümü', value: '' },
      { label: 'Aksiyon', value: 'aksiyon' },
      { label: 'Bilim Kurgu', value: 'bilim-kurgu' },
      { label: 'Doğaüstü', value: 'dogaustu' },
      { label: 'Dövüş Sanatları', value: 'dovus-sanatlari' },
      { label: 'Dram', value: 'dram' },
      { label: 'Ecchi', value: 'ecchi' },
      { label: 'Fantastik', value: 'fantastik' },
      { label: 'Gerilim', value: 'gerilim' },
      { label: 'Gizem', value: 'gizem' },
      { label: 'Hayattan Bir Parça', value: 'hayattan-bir-parca' },
      { label: 'Hayattan Kesitler', value: 'hayattan-kesitler' },
      { label: 'Komedi', value: 'komedi' },
      { label: 'Korku', value: 'korku' },
      { label: 'Macera', value: 'macera' },
      { label: 'Psikolojik', value: 'psikolojik' },
      { label: 'Romantizm', value: 'romantizm' },
      { label: 'Spor', value: 'spor' },
      { label: 'Tarihi', value: 'tarihi' },
      { label: 'Trajedi', value: 'trajedi' },
    ],
  },
  {
    type: 'select',
    id: 'demographic',
    label: 'Demografi',
    options: [
      { label: 'Tümü', value: '' },
      { label: 'Genç Erkek (Shounen)', value: '1' },
      { label: 'Genç Kız (Shoujo)', value: '2' },
      { label: 'Yetişkin Erkek (Seinen)', value: '3' },
      { label: 'Yetişkin Kadın (Josei)', value: '4' },
      { label: 'Çocuk (Kodomo)', value: '5' },
    ],
  },
];
const ARRAY_PARAMS: Record<string, string> = {
  status: 'status[]',
  category: 'categories[]',
  demographic: 'demographics[]',
};

interface MangaDto {
  title: string;
  slug: string;
  cover_url?: string | null;
  cover_thumb_url?: string | null;
  description?: string | null;
  status?: string | null;
  categories?: { name: string }[];
  genres?: { name: string }[];
  authors?: { name: string }[];
  chapters?: { number: number | string; title?: string | null; slug: string; published_at?: string | null }[];
}

async function api<T>(path: string): Promise<T> {
  const response = await http.get(`${API_URL}${path}`, { headers: apiHeaders });
  return JSON.parse(response.body) as T;
}

const toSummary = (dto: MangaDto): MangaSummary => ({
  url: `/manga/${dto.slug}`,
  title: dto.title,
  thumbnailUrl: dto.cover_url ?? dto.cover_thumb_url ?? undefined,
});

async function list(query: string): Promise<MangaPage> {
  const result = await api<{ data: { manga: { data: MangaDto[]; current_page: number; last_page: number } } }>(
    `/web/manga?${query}`,
  );
  const manga = result.data.manga;
  return { items: manga.data.map(toSummary), hasNextPage: manga.current_page < manga.last_page };
}

const slugOf = (url: string) =>
  url
    .trim()
    .replace(/^\//, '')
    .replace(/^manga\//, '');

// Scrambled pages ("tiled-v1"): the grid and seed travel in the url fragment.
const TA = 2463534242;
const VO = 2654435769;
const BO = 2246822507;

function shuffle(length: number, seed: number): number[] {
  const t = Array.from({ length: Math.max(1, length) }, (_, i) => i);
  let e = seed >>> 0 || TA;
  const next = () => {
    e = (e ^ (e << 13)) >>> 0;
    e = (e ^ (e >>> 17)) >>> 0;
    e = (e ^ (e << 5)) >>> 0;
    return e;
  };
  for (let n = t.length - 1; n >= 1; n--) {
    const i = next() % (n + 1);
    [t[n], t[i]] = [t[i]!, t[n]!];
  }
  return t;
}

const createSlices = (total: number, pieces: number) => {
  const t = Math.max(1, total);
  const r = Math.max(1, Math.min(pieces, t));
  return Array.from({ length: r }, (_, i) => {
    const offset = Math.floor((i * t) / r);
    return { offset, length: Math.max(1, Math.floor(((i + 1) * t) / r) - offset) };
  });
};

const mapSlices = (slices: { offset: number; length: number }[], indices: number[]) => {
  let offset = 0;
  return indices.map((r) => {
    const length = slices[r]?.length ?? 1;
    const slice = { offset, length };
    offset += length;
    return slice;
  });
};

const text = (filters: FilterState, id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`sort=popular&page=${page}`),
    getLatest: (page) => list(`sort=latest&page=${page}`),
    getFilters: () => FILTERS,
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`page=${page}`];
      if (query.trim()) params.push(`q=${encodeURIComponent(query.trim())}`);
      if (text(filters, 'sort')) params.push(`sort=${text(filters, 'sort')}`);
      for (const [id, param] of Object.entries(ARRAY_PARAMS)) {
        if (text(filters, id)) params.push(`${encodeURIComponent(param)}=${encodeURIComponent(text(filters, id))}`);
      }
      return list(params.join('&'));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = (await api<{ data: { manga: MangaDto } }>(`/web/manga/${slugOf(manga.url)}`)).data.manga;
      const statuses: Record<string, MangaStatus> = { ongoing: 'ongoing', completed: 'completed' };
      const genres = [...new Set([...(dto.categories ?? []), ...(dto.genres ?? [])].map((g) => g.name))];
      return {
        ...toSummary(dto),
        description: dto.description ?? undefined,
        author: dto.authors?.map((a) => a.name).join(', ') || undefined,
        genres: genres.length ? genres : undefined,
        status: statuses[dto.status ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const dto = (await api<{ data: { manga: MangaDto } }>(`/web/manga/${slugOf(manga.url)}`)).data.manga;
      return (dto.chapters ?? []).map((chapter) => {
        const number = String(chapter.number);
        return {
          url: `/read/${dto.slug}/${chapter.slug}`,
          name: `Bölüm ${number}${chapter.title?.trim() ? `: ${chapter.title}` : ''}`,
          number: Number.parseFloat(number) || undefined,
          uploadedAt: Date.parse(chapter.published_at ?? '') || undefined,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const path = chapter.url
        .trim()
        .replace(/^\//, '')
        .replace(/^read\//, '')
        .replace(/^manga\//, '');
      const slash = path.indexOf('/');
      const dto = await api<{
        pages?: { image_url: string; scramble?: { method?: string; grid?: number; seed?: number } | null }[];
      }>(`/reader/${path.slice(0, slash)}/${path.slice(slash + 1)}`);
      return (dto.pages ?? []).map((page, index) => {
        const scramble = page.scramble;
        const scrambled = scramble?.method === 'tiled-v1' && scramble.grid != null && scramble.seed != null;
        return {
          index,
          imageUrl: scrambled
            ? `${page.image_url}#${JSON.stringify({ grid: scramble.grid, seed: scramble.seed })}`
            : page.image_url,
        };
      });
    },
    imageHeaders: () => headers,
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const fragment = (page.imageUrl ?? '').split('#')[1];
      if (!fragment?.startsWith('{')) return {};
      const { grid, seed } = JSON.parse(decodeURIComponent(fragment)) as { grid: number; seed: number };
      const size = imageSize(bytes);
      if (!size) return {};
      const [w, h] = size;
      const l = Math.max(1, Math.min(grid, Math.min(w, h)));
      const u = createSlices(w, l);
      const c = createSlices(h, l);
      const m = shuffle(l, ((seed >>> 0) ^ BO) >>> 0);
      const f = shuffle(l, ((seed >>> 0) ^ VO) >>> 0);
      const p = mapSlices(u, m);
      const g = mapSlices(c, f);
      const ops = [];
      for (let hIdx = 0; hIdx < l; hIdx++) {
        const v = c[f[hIdx]!]!;
        const y = g[hIdx]!;
        for (let bIdx = 0; bIdx < l; bIdx++) {
          const k = u[m[bIdx]!]!;
          const t = p[bIdx]!;
          ops.push({
            sx: t.offset,
            sy: y.offset,
            w: Math.min(t.length, k.length),
            h: Math.min(y.length, v.length),
            dx: k.offset,
            dy: v.offset,
          });
        }
      }
      return { tiles: { width: w, height: h, ops } };
    },
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
