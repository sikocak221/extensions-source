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

const BASE_URL = 'https://sleptmanga.com.tr';
const API_KEY = 'slept-flutter-xK9mP2wQ7vL4nJ8hB3cF6dR1';
const APP_VERSION = '1.0.5';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const SELECTS: Filter[] = [
  {
    type: 'select',
    id: 'sort',
    label: 'Sıralama',
    options: [
      { label: 'Son Güncellenen', value: 'latest' },
      { label: 'Popülerlik', value: 'popular' },
      { label: 'Yüksek Puan', value: 'rating' },
      { label: 'Görüntülenme', value: 'views' },
      { label: 'İsim (A-Z)', value: 'name' },
      { label: 'İsim (Z-A)', value: 'name_desc' },
    ],
  },
  {
    type: 'select',
    id: 'status',
    label: 'Durum',
    options: [
      { label: 'Tümü', value: 'all' },
      { label: 'Devam Ediyor', value: 'ongoing' },
      { label: 'Tamamlandı', value: 'completed' },
      { label: 'Ara Verildi', value: 'hiatus' },
    ],
  },
  {
    type: 'select',
    id: 'type',
    label: 'Tür',
    options: [
      { label: 'Tümü', value: 'all' },
      { label: 'Manga', value: 'manga' },
      { label: 'Manhwa', value: 'manhwa' },
      { label: 'Manhua', value: 'manhua' },
    ],
  },
];
const GENRES: [string, string][] = [
  ['Fantastik', 'fantastik'],
  ['Romantizm', 'romantizm'],
  ['Drama', 'drama'],
  ['Komedi', 'komedi'],
  ['Aksiyon', 'aksiyon'],
  ['Romantik', 'romantik'],
  ['One-Shot', 'one-shot'],
  ['Okul', 'okul'],
  ['Korku', 'korku'],
  ['Macera', 'macera'],
  ['Doğaüstü', 'dogaustu'],
  ['Shoujo', 'shoujo'],
  ['Isekai', 'isekai'],
  ['Shounen', 'shounen'],
  ['Fantezi', 'fantezi'],
  ['Dram', 'dram'],
  ['Tragedy', 'tragedy'],
  ['Suç', 'suc'],
  ['Trajedi', 'trajedi'],
  ['Romance', 'romance'],
  ['Gizem', 'gizem'],
  ['İntikam', 'i-ntikam'],
  ['Politika', 'politika'],
  ['Bilim Kurgu', 'bilim-kurgu'],
  ['Okul Hayatı', 'okul-hayati'],
];

interface SeriesDto {
  name: string;
  chapters: { number: number; chapterTitle?: string | null; createdAt?: string | null }[];
  description?: string | null;
  cover?: string | null;
  genres?: string[];
  status?: string | null;
  owner?: { username?: string | null } | null;
}

async function listing(query: string): Promise<MangaPage> {
  const response = await http.get(`${BASE_URL}/browse?${query}`, { headers });
  const document = html.load(response.body, { baseUrl: response.url });
  const cards = document.select('div.group:has(h3 a)');
  const items = cards.flatMap((card): MangaSummary[] => {
    const link = card.selectFirst('h3 a');
    const href = link?.absUrl('href') || link?.attr('href');
    if (!link || !href || relativeUrl(href).split('/')[1] === 'novel') return [];
    const title = link.text() || card.selectFirst('img')?.attr('alt');
    if (!title?.trim()) return [];
    return [{ url: relativeUrl(href), title, thumbnailUrl: card.selectFirst('img')?.absUrl('src') || undefined }];
  });
  const pagination = findRscObject<{ currentPage: number; totalPages: number }>(
    response.body,
    (v) => typeof v.currentPage === 'number' && typeof v.totalPages === 'number',
  );
  return { items, hasNextPage: pagination ? pagination.currentPage < pagination.totalPages : cards.length >= 24 };
}

const text = (filters: FilterState, id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
const numberText = (n: number) => String(n);

// The RSC payload of the series page: a text chunk is glued to the row that holds the series object, so the
// generic row parser misses it; take the balanced JSON object after `"series":`.
function balancedJson(body: string, start: number): string | undefined {
  let depth = 0;
  let inString = false;
  for (let i = start; i < body.length; i++) {
    const char = body[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth++;
    else if ((char === '}' || char === ']') && --depth === 0) return body.slice(start, i + 1);
  }
  return undefined;
}

async function series(manga: MangaSummary): Promise<SeriesDto> {
  const response = await http.get(absoluteUrl(BASE_URL, manga.url), { headers: { ...headers, rsc: '1' } });
  const marker = '"series":{"_id"';
  const at = response.body.indexOf(marker);
  const json = at >= 0 ? balancedJson(response.body, at + '"series":'.length) : undefined;
  if (!json) throw new Error('Manga detayları bulunamadı');
  return JSON.parse(json) as SeriesDto;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => listing(`sort=popular&page=${page}`),
    getLatest: (page) => listing(`sort=latest&page=${page}`),
    getFilters: (): Filter[] => [
      ...SELECTS,
      { type: 'separator' },
      {
        type: 'group',
        id: 'genres',
        label: 'Kategoriler',
        filters: GENRES.map(([label, value]): Filter => ({ type: 'checkbox', id: `genre.${value}`, label })),
      },
    ],
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`page=${page}`];
      if (query) params.push(`q=${encodeURIComponent(query)}`);
      params.push(`sort=${text(filters, 'sort') || 'latest'}`);
      for (const id of ['status', 'type']) {
        const value = text(filters, id);
        if (value && value !== 'all') params.push(`${id}=${encodeURIComponent(value)}`);
      }
      for (const [id, value] of Object.entries(filters)) {
        if (id.startsWith('genre.') && value === true) params.push(`genres=${encodeURIComponent(id.slice(6))}`);
      }
      return listing(params.join('&'));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await series(manga);
      const statuses: Record<string, MangaStatus> = {
        'Devam Ediyor': 'ongoing',
        Tamamlandı: 'completed',
        'Ara Verildi': 'hiatus',
      };
      return {
        url: manga.url,
        title: dto.name,
        description: dto.description ?? undefined,
        thumbnailUrl: dto.cover
          ? dto.cover.startsWith('http')
            ? dto.cover
            : BASE_URL + dto.cover
          : manga.thumbnailUrl,
        genres: dto.genres?.length ? dto.genres : undefined,
        author: dto.owner?.username ?? undefined,
        status: statuses[dto.status ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const dto = await series(manga);
      const base = manga.url.replace(/\/$/, '');
      return dto.chapters
        .map((chapter) => {
          const number = numberText(chapter.number);
          const title = chapter.chapterTitle;
          return {
            url: `${base}/${number}`,
            name: title && title.trim() && title !== '$undefined' ? title : `Bölüm ${number}`,
            number: chapter.number,
            uploadedAt: Date.parse((chapter.createdAt ?? '').replace(/^\$D/, '')) || undefined,
          };
        })
        .sort((a, b) => b.number - a.number);
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const segments = chapter.url.split('/').filter(Boolean);
      const slug = segments[segments.length - 2];
      const number = segments[segments.length - 1];
      const response = await http.get(`${BASE_URL}/api/chapters/${slug}/${number}/images`, {
        headers: { ...headers, 'X-API-Key': API_KEY, 'X-App-Version': APP_VERSION },
      });
      const data = JSON.parse(response.body) as { images: { url: string }[] };
      return data.images.map((image, index) => ({
        index,
        imageUrl: image.url.startsWith('http') ? image.url : BASE_URL + image.url,
      }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(manhwa|manga|manhua)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL)
        ? { url: `/${match[2]}/${match[3]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
