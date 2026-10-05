import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities } from './common/utils';

const BASE_URL = 'https://mangamoins.com';
const API_URL = `${BASE_URL}/api/v1`;
const MANGA_PAGE_LIMIT = 20;
const FALLBACK_SALTS = ['a1f', 'Z0_9'];
const SALT_EXPIRY = 3 * 60 * 60 * 1000; // 3 hours

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface ListItem {
  title: string;
  cover?: string;
  mangaSlug?: string | null;
  slug?: string | null;
}

interface ListResponse {
  total?: number;
  page?: number;
  limit?: number;
  data?: ListItem[];
}

const toMangaSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const unescapeHtml = (value: string) => decodeEntities(value);

let session = '';

/** The API answers 403 without the session cookie of a visit to the home page (sent with a Referer). */
async function bootstrap(): Promise<void> {
  // Some visits also set a second cookie, and the host only reports the last one: visit again until the session shows.
  for (let attempt = 0; attempt < 5; attempt++) {
    // The query keeps the visits apart (recorded fixtures are keyed by url).
    const response = await http.request({ url: attempt === 0 ? BASE_URL : `${BASE_URL}/?visit=${attempt}`, headers });
    const setCookie = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1] ?? '';
    const value = /mm_session=([^;,\s]+)/.exec(setCookie)?.[1];
    if (value) {
      session = `mm_session=${value}`;
      return;
    }
  }
}

async function api<T>(path: string): Promise<T> {
  const url = `${API_URL}/${path}`;
  if (!session) await bootstrap();
  const request = () => http.request<string>({ url, headers: session ? { ...headers, Cookie: session } : headers });
  let response = await request();
  if (response.status === 403) {
    await bootstrap();
    response = await request();
  }
  if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
  return JSON.parse(response.body) as T;
}

function toSummary(item: ListItem): MangaSummary {
  const title = unescapeHtml(item.title);
  return {
    url: `/${item.mangaSlug ?? item.slug ?? toMangaSlug(title)}`,
    title,
    thumbnailUrl: item.cover || undefined,
  };
}

function toPage(list: ListResponse): MangaPage {
  return {
    items: (list.data ?? []).map(toSummary),
    hasNextPage: (list.page ?? 1) * (list.limit ?? 10) < (list.total ?? 0),
  };
}

let cachedSalts: string[] = [];
let lastSaltFetch = 0;

/** The page folder names are padded with salts that the reader script knows. */
async function getSalts(pagesBaseUrl: string): Promise<string[]> {
  const now = Date.now();
  if (cachedSalts.length > 0 && now - lastSaltFetch < SALT_EXPIRY) return cachedSalts;
  try {
    const script = (await http.get(`${BASE_URL}/includes/components/js/reader.js`, { headers })).body;
    const pathSegment = pagesBaseUrl.replace(/\/$/, '').split('/').pop() ?? '';
    const salts: string[] = [];
    const polochon = /polochon['"]?\s*\]?\s*=\s*['"]([^'"]+)['"]/.exec(script)?.[1];
    if (polochon && pathSegment.includes(polochon)) salts.push(polochon);
    for (const match of script.matchAll(/['"]([^'"]*)['"]/g)) {
      const s = match[1]!.replace(/\\x([a-f\d]{2})/gi, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
      if (s.length >= 3 && pathSegment.includes(s)) salts.push(s);
    }
    const result = [...new Set(salts)].sort((a, b) => b.length - a.length);
    if (result.length > 0) {
      cachedSalts = result;
      lastSaltFetch = now;
    }
  } catch {
    // fall back to the known salts
  }
  return cachedSalts.length > 0 ? cachedSalts : FALLBACK_SALTS;
}

const slugOf = (url: string) => url.replace(/^\/+/, '');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const result = await api<{ data?: ListItem[] }>('trend');
      // The trend API has no pagination.
      return { items: (result.data ?? []).map(toSummary), hasNextPage: false };
    },
    async getLatest(page): Promise<MangaPage> {
      return toPage(await api<ListResponse>(`mangas?page=${page}&limit=${MANGA_PAGE_LIMIT}`));
    },
    async search(query, page): Promise<MangaPage> {
      const q = query ? `&q=${encodeURIComponent(query)}` : '';
      return toPage(await api<ListResponse>(`explore?page=${page}&limit=${MANGA_PAGE_LIMIT}${q}`));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { info } = await api<{
        info: { title: string; author?: string; status?: string; cover?: string; description?: string };
      }>(`manga?manga=${encodeURIComponent(toMangaSlug(slugOf(manga.url)))}`);
      const status = (info.status ?? '').toLowerCase();
      const author = unescapeHtml(info.author ?? '');
      return {
        url: manga.url,
        title: unescapeHtml(info.title),
        author: author || undefined,
        artist: author || undefined,
        description: unescapeHtml(info.description ?? '').trim() || undefined,
        thumbnailUrl: info.cover || undefined,
        status: status.includes('en cours') ? 'ongoing' : status.includes('termin') ? 'completed' : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const result = await api<{ chapters?: { slug: string; num: number; title?: string; time?: number }[] }>(
        `manga?manga=${encodeURIComponent(toMangaSlug(slugOf(manga.url)))}`,
      );
      return (result.chapters ?? []).map((ch) => {
        const chapterName = `Chapitre ${String(ch.num).replace(/\.0$/, '')}`;
        const title = unescapeHtml(ch.title ?? '');
        return {
          url: `/scan/${ch.slug}`,
          name:
            title.trim() && title.toLowerCase() !== chapterName.toLowerCase()
              ? `${chapterName} - ${title}`
              : chapterName,
          number: ch.num,
          uploadedAt: ch.time ? ch.time * 1000 : undefined,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const slug = chapter.url.replace(/^\/scan\//, '');
      const data = await api<{ pageNumbers: number; pagesBaseUrl: string }>(`scan?slug=${encodeURIComponent(slug)}`);
      const salts = await getSalts(data.pagesBaseUrl);
      const base = salts.reduce(
        (url, salt) => url.split(salt).join(''),
        data.pagesBaseUrl.replace(/\/$/, '').replace(/_b$/, ''),
      );
      return Array.from({ length: data.pageNumbers }, (_, i) => ({
        index: i,
        imageUrl: `${base}/${String(i + 1).padStart(2, '0')}.webp`,
      }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) =>
      item.url.startsWith('/scan/') ? `${BASE_URL}${item.url}` : `${BASE_URL}/manga/${toMangaSlug(slugOf(item.url))}`,
    resolveUrl(url): MangaSummary | null {
      const slug = /^https?:\/\/(?:www\.)?mangamoins\.com\/manga\/([^/?#]+)/i.exec(url)?.[1];
      return slug ? { url: `/${slug}`, title: '' } : null;
    },
  }),
});
