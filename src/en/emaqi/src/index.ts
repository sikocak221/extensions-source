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
import { PUBLIC_KEY_SPKI, decryptImage, rsaOaepDecrypt } from './crypto';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://emaqi.com';
const API_URL = 'https://api.emaqi.com/graphql';
const HIDE_LOCKED_PREF_KEY = 'hide_locked';
const EMAIL_PREF_KEY = 'email_pref';
const PASSWORD_PREF_KEY = 'password_pref';
const LOGIN_KEY = 'AIzaSyC6NaQ5vOOartIGTPJHGgSP1OBjpSNKrZo';
const SEARCH_LIMIT = 50;
const headers = { 'User-Agent': USER_AGENT };

const SERIES_QUERY = `
query FetchHomeSection($slug: String!, $mangaAfter: String) {
  homeSection(slug: $slug) {
    mangaConn(first: 40, after: $mangaAfter) {
      edges { node { comic { comicId slug title cover { url } } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const SEARCH_QUERY = `
query Search($input: SearchInput!) {
  search(input: $input) { comicId slug title cover { url } }
}`;

const COMIC_QUERY = `
query FetchComicData($comicId: String!) {
  comicVolumes(comicId: $comicId) {
    comic {
      slug title synopsis rating creators publisher completed
      cover { url }
      genres { ... on Tag { name } }
    }
    volumes { comicId volumeNumber eisbn slug name trialPage purchased free releasesAt }
  }
  chapters(comicId: $comicId) { comicId chapterNumber name purchased free releasesAt }
}`;

const CHAPTER_QUERY = `
query FetchChapterContents($comicId: String!, $chapterNumber: Int!) {
  chapter(comicId: $comicId, chapterNumber: $chapterNumber) { contents { pages { url } hash } }
}`;

const VOLUME_QUERY = `
query FetchMangaContents($comicId: String!, $volumeNumber: Int!) {
  manga(comicId: $comicId, volumeNumber: $volumeNumber) { contents { pages { url } hash } }
}`;

const GENRES: [string, string][] = [
  ['Death Game', 'death-game'],
  ['Psychological', 'psychological'],
  ['Boys Love', 'boys-love'],
  ['Suspense', 'suspense'],
  ['Military', 'military'],
  ['Rom-Com', 'rom-com'],
  ['Mystery', 'mystery'],
  ['Adventure', 'adventure'],
  ['Drama', 'drama'],
  ['Slice of Life', 'slice-of-life'],
  ['Girls Love', 'girls-love'],
  ['Sports', 'sports'],
  ['Dark Drama', 'dark-drama'],
  ['Sci-Fi', 'sci-fi'],
  ['Isekai', 'isekai'],
  ['Action', 'action'],
  ['Fantasy', 'fantasy'],
  ['Horror', 'horror'],
  ['Romance', 'romance'],
  ['Comedy', 'comedy'],
];

interface Comic {
  comicId: string;
  slug: string;
  title: string;
  cover?: { url?: string | null } | null;
}
interface ChapterDto {
  comicId: string;
  chapterNumber: number;
  name: string;
  purchased?: boolean | null;
  free?: boolean | null;
  releasesAt?: string | null;
}
interface VolumeDto {
  comicId: string;
  volumeNumber: number;
  eisbn?: string | null;
  slug: string;
  name: string;
  trialPage?: number | null;
  purchased?: boolean | null;
  free?: boolean | null;
  releasesAt?: string | null;
}
interface Contents {
  pages: { url: string }[];
  hash: string;
}

interface Tokens {
  idToken: string;
  refreshToken: string;
}

let loginFailed = false;
// Cursors of the home sections, by section and page (the API pages by cursor, not by number).
const cursors = new Map<string, string>();

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (h) => Number.parseInt(h, 16));

async function login(): Promise<Tokens | null> {
  const email = prefs.get<string>(EMAIL_PREF_KEY) ?? '';
  const password = prefs.get<string>(PASSWORD_PREF_KEY) ?? '';
  if (!email || !password) return null;
  const response = await http.request<{ idToken: string; refreshToken: string }>({
    url: `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${LOGIN_KEY}`,
    method: 'POST',
    headers,
    body: { json: { email, password, returnSecureToken: true } },
    responseType: 'json',
  });
  if (response.status < 200 || response.status >= 300) {
    loginFailed = true;
    return null;
  }
  return response.body;
}

async function refresh(refreshToken: string): Promise<Tokens | null> {
  const response = await http.request<{ id_token: string; refresh_token: string }>({
    url: `https://securetoken.googleapis.com/v1/token?key=${LOGIN_KEY}`,
    method: 'POST',
    headers,
    body: { json: { grant_type: 'refresh_token', refresh_token: refreshToken } },
    responseType: 'json',
  });
  if (response.status < 200 || response.status >= 300) return null;
  return { idToken: response.body.id_token, refreshToken: response.body.refresh_token };
}

async function getToken(): Promise<string | null> {
  if (loginFailed) return null;
  const saved = await storage.get<{ token: string; refresh: string; expires: number; account: string }>('session');
  const account = `${prefs.get<string>(EMAIL_PREF_KEY) ?? ''}\n${prefs.get<string>(PASSWORD_PREF_KEY) ?? ''}`;
  // A changed e-mail or password drops the saved session (Kotlin clears the tokens on change).
  const session = saved?.account === account ? saved : undefined;
  if (session && Date.now() < session.expires) return session.token;
  const tokens = (session?.refresh ? await refresh(session.refresh) : null) ?? (await login());
  if (!tokens) return null;
  await storage.set('session', {
    token: tokens.idToken,
    refresh: tokens.refreshToken,
    expires: Date.now() + 3_600_000,
    account,
  });
  return tokens.idToken;
}

async function graphql<T>(
  query: string,
  operationName: string,
  variables: unknown,
  extra: Record<string, string> = {},
): Promise<T> {
  const token = await getToken();
  const response = await http.request<{ data?: T; errors?: { message: string }[] }>({
    url: API_URL,
    method: 'POST',
    headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    body: { json: { query, operationName, variables } },
    responseType: 'json',
  });
  if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
  const { data, errors } = response.body;
  if (!data) throw new Error(errors?.[0]?.message ?? 'Empty GraphQL response');
  return data;
}

const mangaOf = (comic: Comic): MangaSummary => ({
  url: `/manga/${comic.slug}`,
  title: comic.title,
  thumbnailUrl: comic.cover?.url || undefined,
});

// Manga urls hold the slug only (so web links resolve to them); the API wants the comic id.
const comicIds = new Map<string, string>();
async function comicIdOf(url: string): Promise<string> {
  const slug = /\/manga\/([^/?#]+)/.exec(url)?.[1] ?? '';
  let id = comicIds.get(slug);
  if (!id) {
    const data = await graphql<{ comic: { comicId: string } | null }>(
      'query Comic($slug: String!) { comic(slug: $slug) { comicId } }',
      'Comic',
      { slug },
    );
    if (!data.comic) throw new Error('Comic not found');
    id = data.comic.comicId;
    comicIds.set(slug, id);
  }
  return id;
}

async function section(slug: string, page: number): Promise<MangaPage> {
  // Pages are reached by cursor: start at the nearest page whose cursor is known.
  let current = page;
  while (current > 1 && !cursors.has(`${slug}:${current}`)) current--;
  for (; ; current++) {
    const data = await graphql<{
      homeSection: {
        mangaConn: {
          edges: { node: { comic: Comic } }[];
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      };
    }>(SERIES_QUERY, 'FetchHomeSection', {
      slug,
      mangaAfter: current === 1 ? null : cursors.get(`${slug}:${current}`),
    });
    const conn = data.homeSection.mangaConn;
    cursors.set(`${slug}:${current + 1}`, conn.pageInfo.endCursor);
    if (current === page || !conn.pageInfo.hasNextPage)
      return {
        items: current === page ? conn.edges.map((e) => mangaOf(e.node.comic)) : [],
        hasNextPage: conn.pageInfo.hasNextPage,
      };
  }
}

const isLocked = (item: { purchased?: boolean | null; free?: boolean | null }) =>
  item.purchased === false && item.free === false;

export default defineExtension({
  preferences: () => [
    { type: 'switch', key: HIDE_LOCKED_PREF_KEY, label: 'Hide Locked Chapters', default: false },
    { type: 'text', key: EMAIL_PREF_KEY, label: 'E-Mail', default: '' },
    { type: 'text', key: PASSWORD_PREF_KEY, label: 'Password', default: '' },
  ],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => section('this-week-s-bestsellers', page),
    getLatest: (page) => section('hot-release', page),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const genres = GENRES.map(([, slug]) => slug).filter((slug) => filters[`genre-${slug}`] === true);
      const tagSlugGroups =
        filters.genreMode === 'or' ? [{ tagSlugs: genres }] : genres.map((slug) => ({ tagSlugs: [slug] }));
      const data = await graphql<{ search: Comic[] }>(SEARCH_QUERY, 'Search', {
        input: { keyword: query.trim(), tagSlugGroups, page, limit: SEARCH_LIMIT },
      });
      return { items: data.search.map(mangaOf), hasNextPage: data.search.length === SEARCH_LIMIT };
    },
    getFilters: (): Filter[] => [
      {
        type: 'group',
        id: 'genres',
        label: 'Genres',
        filters: GENRES.map(([label, slug]): Filter => ({ type: 'checkbox', id: `genre-${slug}`, label })),
      },
      {
        type: 'select',
        id: 'genreMode',
        label: 'Genre mode',
        options: [
          { value: 'and', label: 'AND' },
          { value: 'or', label: 'OR' },
        ],
        default: 'and',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { comicVolumes } = await comicData(manga);
      const comic = comicVolumes.comic as typeof comicVolumes.comic & Record<string, unknown>;
      const parts = [
        (comic.synopsis as string | null | undefined) ?? '',
        comic.publisher ? `\n\nPublisher: ${comic.publisher}` : '',
        comic.rating != null ? `\n\nAge limit: ${comic.rating}+` : '',
      ];
      return {
        url: manga.url,
        title: comic.title as string,
        author: (comic.creators as string[] | null | undefined)?.join(', '),
        description: parts.join('') || undefined,
        genres: (comic.genres as { name: string }[] | null | undefined)?.map((g) => g.name),
        status: comic.completed === true ? 'completed' : 'ongoing',
        thumbnailUrl: (comic.cover as { url?: string } | null | undefined)?.url || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const data = await comicData(manga);
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED_PREF_KEY) ?? false;
      const comicSlug = data.comicVolumes.comic.slug;
      const chapters = data.chapters
        .filter((c) => !hideLocked || !isLocked(c))
        .map((c): Chapter => ({
          // Doubles as the reader's web path; the comic id travels in the fragment.
          url: `/reader/${comicSlug}?type=chapter&chapter=${c.chapterNumber}#${c.comicId}`,
          name: `${isLocked(c) ? '🔒 ' : ''}${c.name}`,
          number: c.chapterNumber,
          uploadedAt: c.releasesAt ? Date.parse(c.releasesAt) || undefined : undefined,
        }))
        .reverse();
      const volumes = data.comicVolumes.volumes
        .filter((v) => !hideLocked || !isLocked(v))
        .map((v): Chapter => {
          const preview = isLocked(v) && v.trialPage != null && v.trialPage > 0;
          return {
            url: `/reader/${v.slug ? `${comicSlug}-${v.slug}` : comicSlug}#${v.comicId}:${v.volumeNumber}`,
            name: `${isLocked(v) ? '🔒 ' : ''}${preview ? '(Preview) ' : ''}${v.name || 'Oneshot'}`,
            number: v.volumeNumber,
            uploadedAt: v.releasesAt ? Date.parse(v.releasesAt) || undefined : undefined,
          };
        })
        .reverse();
      return [...chapters, ...volumes];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const fragment = chapter.url.split('#')[1] ?? '';
      const [comicId = '', volumeNumber] = fragment.split(':');
      const number = /[?&]chapter=(\d+)/.exec(chapter.url)?.[1];
      const isVolume = volumeNumber !== undefined && number === undefined;
      const [query, operationName, variables] = isVolume
        ? [VOLUME_QUERY, 'FetchMangaContents', { comicId, volumeNumber: Number(volumeNumber) }]
        : [CHAPTER_QUERY, 'FetchChapterContents', { comicId, chapterNumber: Number(number) }];
      const data = await graphql<Record<string, { contents: Contents | null }>>(query, operationName, variables, {
        'X-Hash': PUBLIC_KEY_SPKI,
      });
      const contents = (data.manga ?? data.chapter)?.contents;
      if (!contents || contents.pages.length === 0) {
        if (loginFailed) throw new Error('Invalid E-Mail or Password');
        throw new Error('Enter your credentials in Settings and purchase this chapter to read.');
      }
      const key = hex(rsaOaepDecrypt(base64.decodeBytes(contents.hash)));
      return contents.pages.map((page, index) => ({ index, imageUrl: `${page.url}#${key}` }));
    },
    imageHeaders: () => headers,
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const key = (page.imageUrl ?? '').split('#')[1];
      if (!key) return {};
      return { bytes: decryptImage(bytes, unhex(key)) };
    },
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?emaqi\.com\/manga\/([^/?#]+)/i.exec(url.trim());
      return match ? { url: `/manga/${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url.split('#')[0]}`,
  }),
});

async function comicData(manga: MangaSummary) {
  const comicId = await comicIdOf(manga.url);
  return graphql<{
    comicVolumes: {
      comic: { slug: string; title: string };
      volumes: VolumeDto[];
    };
    chapters: ChapterDto[];
  }>(COMIC_QUERY, 'FetchComicData', { comicId });
}
