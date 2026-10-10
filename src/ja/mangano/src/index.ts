import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://manga-no.com';
const API = `${BASE_URL}/query`;
const LOGIN_KEY = 'AIzaSyASnOvvLWrECQKNRI0R_82droxO1QMd4O8';
const LOGIN_URL = 'https://identitytoolkit.googleapis.com/v1';
const REFRESH_URL = 'https://securetoken.googleapis.com/v1';
const HIDE_LOCKED = 'hide_locked';
const EMAIL = 'email_pref';
const PASSWORD = 'password_pref';
const baseHeaders = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const TAGS = [
  '日常', 'コメディ・ギャグ', 'ファンタジー', '恋愛', 'ヒューマンドラマ', '学園', 'ラブコメ', 'バトル', 'SF',
  'ホラー', 'BL', 'カラー', 'サスペンス・ミステリー', '異世界', '縦読み', 'エッセイ',
];

const COVER = 'coverImage { url }';
const NODE = `id title ${COVER}`;
const QUERIES = {
  RankingsMonthly: `query RankingsMonthly { ranking { monthly2(first: 100) { edges { node { ${NODE} } } } } }`,
  NewWorks: `query NewWorks($after: String) { newWorks2(first: 50, after: $after) { edges { node { ${NODE} } } pageInfo { endCursor hasNextPage } } }`,
  Search: `query Search($keyword: String!, $after: String) { search(keyword: $keyword first: 50 after: $after) { edges { node { ... on Work { ${NODE} } } } pageInfo { endCursor hasNextPage } } }`,
  Tag: `query Tag($title: String!, $first: Int!, $after: String) { tag(title: $title) { works(first: $first, after: $after) { edges { node { ${NODE} } } pageInfo { endCursor hasNextPage } } } }`,
  MangaDetails: `query MangaDetails($id: ID!) { node(id: $id) { ... on Work { id title description isCompleted ${COVER} user { displayName } tags { title } episodes(first: 1000) { edges { node { id title number publishedAt salesInfo { pagesChargedFrom } purchasedByViewer canViewerSkipPaywall } } } } } }`,
  GetEpisode: `query GetEpisode($id: ID!) { node(id: $id) { ... on Episode { allPagesConnection: pages(first: 2000) { edges { node { image { url } } } } } } }`,
} as const;

interface Tokens {
  idToken: string;
  refreshToken: string;
}
let token: { value: string; refresh: string; expires: number } | undefined;
let loginFailed = false;
let cursor: string | null = null;

const postJson = async <T>(url: string, json: unknown): Promise<T | undefined> => {
  const response = await http.request<T>({ url, method: 'POST', headers: baseHeaders, body: { json }, responseType: 'json' });
  return response.status >= 200 && response.status < 300 ? response.body : undefined;
};

async function getToken(): Promise<string> {
  if (token && Date.now() < token.expires) return token.value;
  let tokens: Tokens | undefined;
  if (token?.refresh) {
    const r = await postJson<{ id_token: string; refresh_token: string }>(`${REFRESH_URL}/token?key=${LOGIN_KEY}`, {
      grant_type: 'refresh_token',
      refresh_token: token.refresh,
    });
    if (r) tokens = { idToken: r.id_token, refreshToken: r.refresh_token };
  }
  const email = prefs.get<string>(EMAIL)?.trim();
  const password = prefs.get<string>(PASSWORD);
  if (!tokens && email && password) {
    const r = await postJson<{ idToken: string; refreshToken: string }>(
      `${LOGIN_URL}/accounts:signInWithPassword?key=${LOGIN_KEY}`,
      { email, password, returnSecureToken: true },
    );
    if (r) tokens = r;
    else loginFailed = true;
  }
  if (!tokens) {
    const r = await postJson<{ idToken: string; refreshToken: string }>(`${LOGIN_URL}/accounts:signUp?key=${LOGIN_KEY}`, {
      returnSecureToken: true,
    });
    if (!r) throw new Error('Could not get an anonymous token');
    tokens = r;
  }
  token = { value: tokens.idToken, refresh: tokens.refreshToken, expires: Date.now() + 3_300_000 };
  return token.value;
}

async function graphql<T>(operationName: keyof typeof QUERIES, variables?: Record<string, unknown>): Promise<T> {
  const { body } = await http.post<{ data?: T; errors?: { message: string }[] }>(
    API,
    { json: { query: QUERIES[operationName], operationName, variables } },
    { headers: { ...baseHeaders, Authorization: `Bearer ${await getToken()}` }, responseType: 'json' },
  );
  if (body.errors?.length && !body.data) throw new Error(body.errors.map((e) => e.message).join('\n'));
  return body.data as T;
}

interface Node {
  id: string;
  title: string;
  description?: string | null;
  isCompleted?: boolean | null;
  coverImage?: { url?: string | null } | null;
  user?: { displayName?: string | null } | null;
  tags?: { title: string }[] | null;
  episodes?: { edges: { node: EpisodeNode }[] };
}
interface EpisodeNode {
  id: string;
  title: string;
  number?: number | null;
  salesInfo?: { pagesChargedFrom: number } | null;
  purchasedByViewer?: boolean | null;
  canViewerSkipPaywall?: boolean | null;
  publishedAt?: string | null;
}
interface Connection {
  edges?: { node: Node }[] | null;
  pageInfo: { endCursor?: string | null; hasNextPage: boolean };
}

const idOf = (url: string) => url.replace(/^\/works\//, '');
const summary = (n: Node): MangaSummary => ({ url: `/works/${n.id}`, title: n.title, thumbnailUrl: n.coverImage?.url ?? undefined });

function connection(c: Connection): MangaPage {
  cursor = c.pageInfo.endCursor ?? null;
  return { items: (c.edges ?? []).map((e) => summary(e.node)), hasNextPage: c.pageInfo.hasNextPage };
}

const paid = (e: EpisodeNode) => e.purchasedByViewer !== true && e.canViewerSkipPaywall !== true;
const isLocked = (e: EpisodeNode) => paid(e) && e.salesInfo?.pagesChargedFrom === 0;
const isPreview = (e: EpisodeNode) => paid(e) && e.salesInfo?.pagesChargedFrom !== 0;

export default defineExtension({
  preferences: () => [
    { type: 'switch', key: HIDE_LOCKED, label: 'Hide Locked Chapters', default: false },
    { type: 'text', key: EMAIL, label: 'E-Mail', default: '' },
    { type: 'text', key: PASSWORD, label: 'Password', default: '' },
  ],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const r = await graphql<{ ranking: { monthly2: Connection } }>('RankingsMonthly');
      return { items: (r.ranking.monthly2.edges ?? []).map((e) => summary(e.node)), hasNextPage: false };
    },
    async getLatest(page: number): Promise<MangaPage> {
      if (page === 1) cursor = null;
      return connection((await graphql<{ newWorks2: Connection }>('NewWorks', { after: cursor })).newWorks2);
    },
    getFilters: (): Filter[] => [
      { type: 'select', id: 'tag', label: '人気のタグ', options: TAGS.map((t) => ({ label: t, value: t })), default: TAGS[0]! },
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (page === 1) cursor = null;
      if (query.trim()) {
        return connection((await graphql<{ search: Connection }>('Search', { keyword: query, after: cursor })).search);
      }
      const tag = typeof filters.tag === 'string' ? filters.tag : TAGS[0]!;
      const r = await graphql<{ tag: { works: Connection } }>('Tag', { title: tag, first: 100, after: cursor });
      return connection(r.tag.works);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { node } = await graphql<{ node: Node }>('MangaDetails', { id: idOf(manga.url) });
      return {
        ...summary(node),
        description: node.description ?? undefined,
        status: node.isCompleted ? 'completed' : 'ongoing',
        author: node.user?.displayName ?? undefined,
        genres: node.tags?.map((t) => t.title),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const hide = prefs.get<boolean>(HIDE_LOCKED) === true;
      const { node } = await graphql<{ node: Node }>('MangaDetails', { id: idOf(manga.url) });
      return (node.episodes?.edges ?? [])
        .map((e) => e.node)
        .filter((e) => !hide || (!isLocked(e) && !isPreview(e)))
        .map((e) => {
          const time = e.publishedAt ? Date.parse(e.publishedAt) : Number.NaN;
          return {
            url: e.id,
            name: `${isLocked(e) ? '🔒 ' : ''}${isPreview(e) ? '🔒 (Preview) ' : ''}${e.title}`,
            number: e.number ?? undefined,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          };
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const r = await graphql<{ node: { allPagesConnection: { edges: { node: { image: { url: string } } }[] } } }>(
        'GetEpisode',
        { id: chapter.url },
      );
      const edges = r.node.allPagesConnection.edges;
      if (!edges.length) {
        if (loginFailed) throw new Error('Invalid E-Mail or Password');
        throw new Error('Enter your credentials in Settings and purchase this chapter to read.');
      }
      return edges.map((e, index) => ({ index, imageUrl: e.node.image.url }));
    },
    imageHeaders: () => baseHeaders,
    resolveUrl(url: string): MangaSummary | null {
      const id = /\/works\/([^/?#]+)/.exec(url)?.[1];
      return hostOf(url) === hostOf(BASE_URL) && id ? { url: `/works/${id}`, title: '' } : null;
    },
    getWebUrl: (item) => ('name' in item ? `${BASE_URL}/episodes/${item.url}` : BASE_URL + item.url),
  }),
});
