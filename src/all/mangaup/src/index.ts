import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate, withQuery } from './common/utils';
import { type Message, decode, int, msg, msgs, str } from './proto';

const BASE_URL = 'https://global.manga-up.com';
const API_URL = 'https://global-api.manga-up.com/api';
const IMG_URL = 'https://global-img.manga-up.com';

const LANG = 'en';
const option = (label: string, value: string) => ({ label, value });

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

/** Parses a Tokyo date like "Jan 05, 2024" (midnight JST) → epoch ms. */
const tokyoDate = (text: string | undefined) => {
  const time = parseDate(text, 'MMM dd, yyyy');
  return time === undefined ? undefined : time - 9 * 3_600_000;
};

async function api(path: string, params: Record<string, string>, post = false): Promise<Message> {
  const secret = prefs.get<string>('secret_token')?.trim();
  const url = withQuery(`${API_URL}/${path}`, { app_ver: '0', os_ver: '0', ...(secret ? { secret } : {}), ...params });
  const response = await http.request({
    url,
    method: post ? 'POST' : 'GET',
    headers,
    body: post ? '' : undefined,
    responseType: 'bytes',
  });
  if (response.status === 401 || response.status === 500)
    throw new Error(secret ? 'Invalid secret token' : 'Log in required');
  if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
  return decode(base64.decodeBytes(response.body as string));
}

interface Title {
  id: number;
  name: string;
  thumbnail?: string;
  bookmarks: number;
  lastUpdated?: string;
}

const titles = (root: Message, field: number): Title[] =>
  msgs(root, field).map((t) => ({
    id: int(t, 1) ?? 0,
    name: str(t, 2) ?? '',
    thumbnail: str(t, 3),
    bookmarks: int(t, 7) ?? 0,
    lastUpdated: str(t, 9),
  }));

const toSummary = (t: Title): MangaSummary => ({
  url: `/manga/${t.id}`,
  title: t.name,
  thumbnailUrl: t.thumbnail ? IMG_URL + t.thumbnail : undefined,
});

const hex = (text: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i + 1 < text.length; i += 2) out.push(Number.parseInt(text.slice(i, i + 2), 16));
  return out;
};

export default defineExtension({
  preferences: () => [
    {
      type: 'switch',
      key: 'hide_paid_chapters',
      label: 'Hide Locked Chapters',
      description: 'Hide chapters that require points to unlock.',
      default: false,
    },
    {
      type: 'text',
      key: 'secret_token',
      label: 'Secret Token',
      description:
        'Paste the "secret" value from the site\'s local storage after logging in to read purchased chapters and see your favorites.',
      default: '',
    },
  ],

  createSource: () => ({
    baseUrl: BASE_URL,

    async getPopular(): Promise<MangaPage> {
      const root = await api('search', { lang: LANG });
      return {
        items: titles(root, 2)
          .sort((a, b) => b.bookmarks - a.bookmarks)
          .map(toSummary),
        hasNextPage: false,
      };
    },

    async getLatest(): Promise<MangaPage> {
      const root = await api('search', { lang: LANG });
      const time = (t: Title) => tokyoDate(t.lastUpdated) ?? 0;
      return {
        items: titles(root, 2)
          .sort((a, b) => time(b) - time(a))
          .map(toSummary),
        hasNextPage: false,
      };
    },

    getFilters(): Filter[] {
      return [
        {
          type: 'select',
          id: 'genre',
          label: 'Genres',
          options: [
            option('All', ''),
            option('Action', '13'),
            option('Adventure', '14'),
            option('Comedy', '15'),
            option('School Life', '16'),
            option('Dark Fantasy', '17'),
            option('Suspense', '18'),
            option('Historical', '19'),
            option('Game', '20'),
            option('Media Tie-ins', '21'),
            option('LGBTQ+', '253'),
            option('Completed', '256'),
            option('Own History', 'history'),
            option('Own Favorites', 'favorites'),
          ],
        },
      ];
    },

    async search(query: string, _page: number, state: FilterState): Promise<MangaPage> {
      const genre = typeof state.genre === 'string' ? state.genre : '';
      if (query.trim()) {
        const root = await api('manga/search', { word: query, lang: LANG });
        return { items: titles(root, 1).map(toSummary), hasNextPage: false };
      }
      if (genre === 'favorites' || genre === 'history') {
        if (!prefs.get<string>('secret_token')?.trim())
          throw new Error(`Set your secret token in the settings to access your ${genre}.`);
        const root = await api('my_page', { lang: LANG });
        return { items: titles(root, genre === 'favorites' ? 1 : 2).map(toSummary), hasNextPage: false };
      }
      if (!genre) {
        const root = await api('search', { lang: LANG });
        return {
          items: titles(root, 2)
            .sort((a, b) => b.bookmarks - a.bookmarks)
            .map(toSummary),
          hasNextPage: false,
        };
      }
      const root = await api('manga/tag', { tag_id: genre, lang: LANG });
      return { items: titles(root, 1).map(toSummary), hasNextPage: false };
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const root = await detail(manga.url);
      const parts = [str(root, 8), str(root, 5), str(root, 6), str(root, 7)].filter((p): p is string => !!p);
      const thumbnail = str(root, 11);
      return {
        url: manga.url,
        title: str(root, 3) ?? manga.title,
        author: str(root, 4),
        description: parts.join('\n\n') || undefined,
        genres: msgs(root, 10)
          .map((g) => str(g, 2) ?? '')
          .filter(Boolean),
        thumbnailUrl: thumbnail ? IMG_URL + thumbnail : manga.thumbnailUrl,
        status: msgs(root, 13).some((c) => msgFlag(c, 12)) ? 'completed' : 'ongoing',
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const root = await detail(manga.url);
      const titleId = manga.url.split('/').pop()!;
      const hidePaid = prefs.get<boolean>('hide_paid_chapters') === true;
      const chapters = msgs(root, 13)
        .filter((c) => !hidePaid || int(c, 6) === undefined)
        .map((c): Chapter => {
          const sub = str(c, 3);
          let title = (str(c, 2) ?? '') + (sub ? ` - ${sub}` : '');
          if (msgFlag(c, 12)) title += ' [Final]';
          return {
            url: `/manga/${titleId}/${int(c, 1)}`,
            name: int(c, 6) !== undefined ? `🔒 ${title}` : title,
            uploadedAt: tokyoDate(str(c, 9)),
          };
        });
      // Newest first (chapter ids grow with time).
      const idOf = (c: Chapter) => Number(c.url.split('/').pop());
      return chapters.sort((a, b) => idOf(b) - idOf(a));
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const chapterId = chapter.url.split('/').pop()!;
      const root = await api('manga/viewer_v2', { chapter_id: chapterId, quality: 'high', lang: LANG }, true);
      const block = msgs(root, 3).find((b) => String(int(b, 1)) === chapterId);
      const pages = msgs(block, 3).filter((p) => !(str(p, 1) ?? '').includes('tutorial'));
      if (pages.length === 0)
        throw new Error('Log in (secret token in the settings) and purchase this chapter to read.');
      return pages.map((p, index) => ({ index, imageUrl: `${IMG_URL}${str(p, 1)}#${str(p, 5)}:${str(p, 6)}` }));
    },

    imageHeaders: () => headers,

    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const fragment = page.imageUrl?.split('#')[1];
      if (!fragment?.includes(':')) return {};
      const [key, iv] = fragment.split(':') as [string, string];
      if (!key || key === 'undefined') return {};
      return { bytes: crypto.aesDecrypt(bytes, hex(key), { mode: 'cbc', iv: hex(iv) }) };
    },

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?global\.manga-up\.com\/manga\/(\d+)/i.exec(url.trim());
      return match ? { url: `/manga/${match[1]}`, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});

/** A varint field read as boolean. */
const msgFlag = (message: Message, field: number) => int(message, field) === 1;

function detail(url: string): Promise<Message> {
  return api('manga/detail_v2', { title_id: url.split('/').pop()!, quality: 'high', ui_lang: LANG });
}
