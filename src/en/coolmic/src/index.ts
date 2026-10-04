import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, decodeEntities, hostOf, parseDate } from './common/utils';
import { pbkdf2Sha256 } from './crypto';

const BASE_URL = 'https://coolmic.me';
const API_URL = `${BASE_URL}/api/v1`;
const CDN_URL = 'https://en-img.coolmic.me';
const SEARCH_SIZE = 20;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Cookie: 'is_mature=true' };

const HIDE_LOCKED_PREFERENCE: Preference = {
  type: 'switch',
  key: 'hide_locked',
  label: 'Hide locked chapters',
  default: false,
};

const SORTS: [string, string][] = [
  ['Relevance', 'relevance'],
  ['Recently Added', 'newest'],
  ['Oldest', 'oldest'],
  ['Popular', 'like_vote'],
  ['Explicitness', 'erotic_rating'],
];

const RATINGS: [string, string][] = [
  ['All', ''],
  ['All Ages', 'is_mature:0'],
  ['Mature (18+)', 'is_mature:1'],
  ['Uncensored', 'is_uncensored:1'],
];

interface Named {
  name: string;
}

interface TitleDto {
  name: string;
  summary?: string | null;
  vertical_thumbnail_url?: string | null;
  artists?: Named[] | null;
  genres?: Named[] | null;
  sub_genres?: Named[] | null;
  tags?: Named[] | null;
  is_completed?: boolean | null;
  is_mature?: boolean | null;
  agency?: string | null;
}

interface EpisodeDto {
  id: number;
  number: string;
  start_at?: string | null;
  is_free?: boolean | null;
  was_purchased?: boolean | null;
  display_order?: number | null;
}

interface PagePayload {
  encrypted_image: string;
  iv: string;
  salt: string;
  iterations: number;
  kms_encrypted_data_key: string;
  file_name: string;
}

async function getJson<T>(url: string): Promise<T> {
  return JSON.parse((await http.get(url, { headers })).body) as T;
}

function cover(titleId: number): string {
  const id = String(titleId).padStart(9, '0');
  return `${CDN_URL}/titles/${id.slice(0, 3)}/${id.slice(0, 6)}/${id}/${id}_large_vertical.jpg`;
}

async function search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
  const sort = typeof filters.sort === 'string' ? filters.sort : 'relevance';
  const params = [
    `keyword=${encodeURIComponent(query.trim())}`,
    `page=${page}`,
    `per=${SEARCH_SIZE}`,
    'search_field=all',
    `sort=${sort}`,
  ];
  const rating = typeof filters.rating === 'string' ? filters.rating : '';
  if (rating) {
    const [field, value] = rating.split(':');
    params.push(`status_filters[0][field]=${field}`, `status_filters[0][value]=${value}`);
  }
  const result = await getJson<{ total: number; results: { title_id: number; title_name: string }[] }>(
    `${API_URL}/search_titles?${params.join('&')}`,
  );
  return {
    items: result.results.map((r) => ({
      url: `/titles/${r.title_id}`,
      title: r.title_name,
      thumbnailUrl: cover(r.title_id),
    })),
    hasNextPage: page * SEARCH_SIZE < result.total,
  };
}

async function pageObjects(url: string): Promise<{ title: TitleDto; episodes: EpisodeDto[] }> {
  const body = (await http.get(absoluteUrl(BASE_URL, url), { headers })).body;
  const raw = /:page-objects\s*=\s*"([^"]*)"/.exec(body)?.[1];
  if (!raw) throw new Error('Could not find the title data');
  return JSON.parse(decodeEntities(raw)) as { title: TitleDto; episodes: EpisodeDto[] };
}

const isLocked = (e: EpisodeDto) => e.is_free === false && e.was_purchased === false;

/** The decryption-key endpoint wants the CSRF token from a page, sent with that page's session cookie. */
async function session(): Promise<{ token: string; cookie: string }> {
  const response = await http.get(BASE_URL, { headers });
  const token = /<meta[^>]+name="csrf-token"[^>]+content="([^"]+)"/.exec(response.body)?.[1] ?? '';
  const setCookie = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1] ?? '';
  const cookies = [...setCookie.matchAll(/(?:^|[,\n]\s*)([\w-]+)=([^;,\n]*)/g)].map((m) => `${m[1]}=${m[2]}`);
  return { token, cookie: ['is_mature=true', ...cookies].join('; ') };
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search('', page, { sort: 'like_vote' }),
    getLatest: (page) => search('', page, { sort: 'newest' }),
    search,
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: 'Sort by',
        options: SORTS.map(([l, v]) => ({ label: l, value: v })),
        default: 'relevance',
      },
      {
        type: 'select',
        id: 'rating',
        label: 'Content Rating',
        options: RATINGS.map(([l, v]) => ({ label: l, value: v })),
        default: '',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { title: t } = await pageObjects(manga.url);
      return {
        url: manga.url,
        title: t.name,
        artist: t.artists?.map((a) => a.name).join(', ') || undefined,
        description:
          [t.summary ?? '', t.agency ? `Publisher: ${t.agency}` : '', t.is_mature ? 'Rating: 18+' : '']
            .filter(Boolean)
            .join('\n\n') || undefined,
        genres: [...new Set([...(t.genres ?? []), ...(t.sub_genres ?? []), ...(t.tags ?? [])].map((g) => g.name))],
        status: t.is_completed ? 'completed' : 'ongoing',
        thumbnailUrl: t.vertical_thumbnail_url?.replace('_vertical.jpg', '_large_vertical.jpg') ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { episodes } = await pageObjects(manga.url);
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED_PREFERENCE.key) ?? false;
      return episodes
        .filter((e) => !hideLocked || !isLocked(e))
        .map((e) => ({
          url: `/episodes/${e.id}`,
          name: `${isLocked(e) ? '🔒 ' : ''}Chapter ${e.number}`,
          number: e.display_order ?? undefined,
          uploadedAt: parseDate(e.start_at, 'MM/dd/yy'),
        }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = chapter.url.split('/').pop();
      const response = await http.request<string>({ url: `${API_URL}/viewer/comic/secure_episodes/${id}`, headers });
      const data =
        response.status === 200
          ? (JSON.parse(response.body) as { image_data?: { num: number; path: string }[] | null })
          : {};
      if (!data.image_data?.length) throw new Error('Log in via WebView and purchase this chapter to read.');
      return data.image_data.map((d) => ({ index: d.num, url: d.path }));
    },
    // Each page is JSON holding the encrypted image; the site hands out its key on request.
    async getImageUrl(page: Page): Promise<string> {
      const payload = await getJson<PagePayload>(page.url ?? '');
      const request = async (s: { token: string; cookie: string }) =>
        http.request<string>({
          url: `${API_URL}/decryption_keys`,
          method: 'POST',
          headers: { ...headers, Cookie: s.cookie, 'X-CSRF-TOKEN': s.token, 'X-Requested-With': 'XMLHttpRequest' },
          body: { json: { encrypted_key: payload.kms_encrypted_data_key, file_name: payload.file_name } },
        });
      let response = await request(await session());
      if (response.status !== 200) response = await request(await session());
      if (response.status !== 200) throw new Error(`Could not get the page key (HTTP ${response.status})`);
      const { decrypted_key } = JSON.parse(response.body) as { decrypted_key: string };
      return `${page.url}#key=${encodeURIComponent(decrypted_key)}`;
    },
    imageHeaders: () => headers,
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const key = /#key=(.*)$/.exec(page.imageUrl ?? '')?.[1];
      if (!key) return {};
      // The payload is ASCII JSON; decoding it in chunks avoids a million-element array.
      let text = '';
      for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const payload = JSON.parse(text) as PagePayload;
      const aesKey = pbkdf2Sha256(
        new Uint8Array(utf8.encode(decodeURIComponent(key))),
        base64.decodeBytes(payload.salt),
        payload.iterations,
      );
      return {
        bytes: crypto.aesDecrypt(base64.decodeBytes(payload.encrypted_image), aesKey, {
          mode: 'cbc',
          iv: base64.decodeBytes(payload.iv),
        }),
      };
    },
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/titles\/(\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/titles/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
