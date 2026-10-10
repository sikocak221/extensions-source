import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';

interface TitleDto {
  id: string;
  display_name: string;
  cover_url: string;
  entries?: { display_name: string; title_id: string; id: string; pages: number; mtime: number }[];
  titles?: TitleDto[];
}

// Session cookie of the Mango server (kept in memory; cleared when the settings change).
let sessionCookie = '';
let sessionKey = '';

/** Levenshtein edit distance. */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(row[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length]!;
}

export default defineExtension({
  preferences: () => [
    {
      type: 'text',
      key: 'server_url',
      label: 'Server address',
      description: 'Address of your Mango server',
      default: 'http://127.0.0.1:9000',
    },
    { type: 'text', key: 'username', label: 'Username', description: 'Your login username', default: 'admin' },
    { type: 'text', key: 'password', label: 'Password', description: 'Your login password', default: '' },
  ],

  createSource: () => {
    const basePath = () => (prefs.get<string>('server_url') ?? 'http://127.0.0.1:9000').trim().replace(/\/+$/, '');
    const apiUrl = () => `${basePath()}/api`;

    async function login(): Promise<string> {
      const username = prefs.get<string>('username') ?? '';
      const password = prefs.get<string>('password') ?? '';
      if (!username || !password) throw new Error('Missing username or password');
      const key = `${basePath()}|${username}|${password}`;
      if (sessionCookie && sessionKey === key) return sessionCookie;
      const response = await http.request({
        url: `${basePath()}/login`,
        method: 'POST',
        body: { form: { username, password } },
      });
      const cookie = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1];
      if (response.status < 200 || response.status >= 300 || !cookie)
        throw new Error('Login failed. Check the address and credentials');
      sessionKey = key;
      return (sessionCookie = cookie.split(';')[0]!);
    }

    async function getJson<T>(url: string): Promise<T> {
      const cookie = await login();
      try {
        return (await http.get<T>(url, { headers: { Cookie: cookie }, responseType: 'json' })).body;
      } catch (error) {
        sessionCookie = '';
        throw new Error(
          `Login likely failed. Try refreshing. (${error instanceof Error ? error.message : String(error)})`,
        );
      }
    }

    const toManga = (t: TitleDto): MangaSummary => ({
      url: `/book/${t.id}`,
      title: t.display_name,
      thumbnailUrl: basePath() + t.cover_url,
    });

    const library = async (): Promise<MangaSummary[]> => {
      const result = await getJson<{ titles?: TitleDto[] }>(`${apiUrl()}/library?depth=0`);
      return (result.titles ?? []).map(toManga);
    };

    function listChapters(title: TitleDto): Chapter[] {
      const top = (title.entries ?? []).map((e) => ({
        url: `/page/${e.title_id}/${e.id}/${e.pages}/`,
        name: e.display_name,
        uploadedAt: e.mtime * 1000,
      }));
      const nested = (title.titles ?? []).flatMap((sub) =>
        listChapters(sub).map((c) => ({ ...c, name: `${sub.display_name} / ${c.name}` })),
      );
      return [...top, ...nested];
    }

    return {
      baseUrl: 'http://127.0.0.1:9000',

      // The popular list is the whole library.
      getPopular: async (): Promise<MangaPage> => ({ items: await library(), hasNextPage: false }),

      async search(query: string): Promise<MangaPage> {
        const q = query.toLowerCase();
        const all = await library();
        const exact = all.find((m) => m.title.toLowerCase() === q);
        if (exact) return { items: [exact], hasNextPage: false };
        const prefix = q.slice(0, 7);
        const items = all
          .filter((m) => m.title.toLowerCase().includes(prefix))
          .sort((a, b) => distance(q, a.title.toLowerCase()) - distance(q, b.title.toLowerCase()));
        return { items, hasNextPage: false };
      },

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const title = await getJson<TitleDto>(`${apiUrl()}${manga.url}?sort=auto`);
        return { ...toManga(title), status: 'unknown' };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const title = await getJson<TitleDto>(`${apiUrl()}${manga.url}?sort=auto`);
        return listChapters(title);
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const parts = chapter.url.split('/');
        const pages = Number.parseInt(parts.splice(parts.length - 2, 1)[0]!, 10);
        const prefix = parts.join('/');
        return Array.from({ length: pages }, (_, i) => ({ index: i, imageUrl: `${apiUrl()}${prefix}${i + 1}` }));
      },

      imageHeaders: () => ({ Cookie: sessionCookie }),

      getWebUrl: (item) => `${basePath()}${item.url}`,
    };
  },
});
