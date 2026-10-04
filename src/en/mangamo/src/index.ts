import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://www.mangamo.com';
const FIREBASE_API_KEY = 'AIzaSyCU00GBJ4BPSK5owyaXvHZIXwMJ5Rq5F8c';
const FUNCTIONS_URL = 'https://us-central1-mangamoapp1.cloudfunctions.net/api';
const FIRESTORE_URL = 'https://firestore.googleapis.com/v1/projects/mangamoapp1/databases/(default)/documents';
const PAGE_SIZE = 50;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

const USER_TOKEN_PREFERENCE: Preference = {
  type: 'text',
  key: 'userToken',
  label: 'User token (paying users: copy it from the Mangamo app, My Manga > Profile > About)',
  default: '',
};

const HIDE_COIN_PREFERENCE: Preference = {
  type: 'switch',
  key: 'hideCoinManga',
  label: 'Hide coin-only series and chapters',
  default: false,
};

const SERIES_FIELDS = [
  'id',
  'name',
  'name_lowercase',
  'description',
  'authors',
  'genres',
  'ongoing',
  'releaseStatusTag',
  'titleArt',
  'onlyTransactional',
];

interface SeriesDto {
  id?: number;
  authors?: { name: string }[];
  description?: string;
  enabled?: boolean;
  genres?: { name: string }[];
  maxFreeChapterNumber?: number;
  maxMeteredReadingChapterNumber?: string;
  name?: string;
  name_lowercase?: string;
  ongoing?: boolean;
  onlyTransactional?: boolean;
  releaseStatusTag?: string;
  titleArt?: string;
}

interface ChapterDto {
  alwaysFree?: boolean;
  id?: number;
  chapterNumber?: number;
  createdAt?: number;
  enabled?: boolean;
  name?: string;
  onlyTransactional?: boolean;
  seriesId?: number;
  type?: string;
}

type FirestoreValue = Record<string, unknown>;

/** Turns Firestore's typed values (`{"stringValue": "x"}`, ...) into plain JSON. */
function reduceValue(value: FirestoreValue): unknown {
  const [type, inner] = Object.entries(value)[0] ?? [];
  if (type === 'arrayValue') return ((inner as { values?: FirestoreValue[] }).values ?? []).map(reduceValue);
  if (type === 'mapValue') return reduceFields((inner as { fields?: Record<string, FirestoreValue> }).fields);
  if (type === 'integerValue') return Number(inner);
  if (type === 'timestampValue') return Date.parse(inner as string);
  return inner;
}

function reduceFields(fields: Record<string, FirestoreValue> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields ?? {}).map(([k, v]) => [k, reduceValue(v)]));
}

// ---- Auth ----

async function postJson<T>(url: string, body: unknown, extra: Record<string, string> = {}): Promise<T> {
  const response = await http.request<string>({
    url,
    method: 'POST',
    headers: { ...jsonHeaders, ...extra },
    body: { json: body },
  });
  if (response.status === 401) throw new Error("You don't have access to this chapter");
  if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${url}`);
  return JSON.parse(response.body) as T;
}

/** The Mangamo user: the one from the settings, or an anonymous Firebase account made once. */
async function userToken(): Promise<string> {
  const configured = prefs.get<string>(USER_TOKEN_PREFERENCE.key)?.trim();
  if (configured) return configured;
  const stored = await storage.get<string>('anonymous_user');
  if (stored) return stored;
  const { localId } = await postJson<{ localId: string }>(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    { returnSecureToken: true },
  );
  await storage.set('anonymous_user', localId);
  return localId;
}

async function idToken(): Promise<string> {
  const user = await userToken();
  const cached = await storage.get<{ user: string; token: string; refresh: string; expires: number }>('id_token');
  if (cached?.user === user && cached.expires > Date.now()) return cached.token;
  let token: { idToken: string; refreshToken: string; expiresIn: string } | undefined;
  if (cached?.user === user) {
    const response = await http.request<string>({
      url: `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
      method: 'POST',
      headers,
      body: { form: { grant_type: 'refresh_token', refresh_token: cached.refresh } },
    });
    if (response.status === 200) {
      const r = JSON.parse(response.body) as { id_token: string; refresh_token: string; expires_in: string };
      token = { idToken: r.id_token, refreshToken: r.refresh_token, expiresIn: r.expires_in };
    }
  }
  if (!token) {
    const { accessToken } = await postJson<{ accessToken: string }>(`${FUNCTIONS_URL}/v3/login`, {
      purchaserInfo: { originalAppUserId: user },
    });
    token = await postJson(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
      {
        token: accessToken,
        returnSecureToken: true,
      },
    );
  }
  await storage.set('id_token', {
    user,
    token: token!.idToken,
    refresh: token!.refreshToken,
    expires: Date.now() + (Number(token!.expiresIn) - 60) * 1000,
  });
  return token!.idToken;
}

// ---- Firestore ----

async function getDocument<T>(path: string, fields: string[]): Promise<T> {
  const mask = fields.map((f) => `mask.fieldPaths=${f}`).join('&');
  const response = await http.get(`${FIRESTORE_URL}/${path}?${mask}`, {
    headers: { ...headers, Authorization: `Bearer ${await idToken()}` },
  });
  return reduceFields((JSON.parse(response.body) as { fields?: Record<string, FirestoreValue> }).fields) as T;
}

async function runQuery<T>(
  collectionPath: string,
  query: Record<string, unknown>,
): Promise<{ items: T[]; count: number }> {
  const pivot = collectionPath.lastIndexOf('/');
  const parent = pivot === -1 ? '' : `/${collectionPath.slice(0, pivot)}`;
  const collectionId = collectionPath.slice(pivot + 1);
  const result = await postJson<{ document?: { fields?: Record<string, FirestoreValue> } }[]>(
    `${FIRESTORE_URL}${parent}:runQuery`,
    { structuredQuery: { from: [{ collectionId }], ...query } },
    { Authorization: `Bearer ${await idToken()}` },
  );
  const documents = result.filter((r) => r.document);
  return { items: documents.map((r) => reduceFields(r.document!.fields) as T), count: documents.length };
}

const select = (fields: string[]) => ({ fields: fields.map((fieldPath) => ({ fieldPath })) });
const fieldFilter = (field: string, op: string, value: Record<string, unknown>) => ({
  fieldFilter: { op, field: { fieldPath: field }, value },
});
const and = (...filters: unknown[]) => ({ compositeFilter: { op: 'AND', filters } });

function toSummary(s: SeriesDto): MangaSummary {
  return {
    url: `/catalog/${encodeURIComponent((s.name_lowercase ?? '').replace(/ /g, '-'))}?series=${s.id}`,
    title: s.name ?? '',
    thumbnailUrl: s.titleArt,
  };
}

function status(s: SeriesDto): MangaStatus {
  switch (s.releaseStatusTag) {
    case 'Ongoing':
      return 'ongoing';
    case 'series-complete':
    case 'Completed':
      return 'completed';
    case 'Paused':
      return 'hiatus';
    default:
      return s.ongoing ? 'ongoing' : 'unknown';
  }
}

const hideCoin = () => prefs.get<boolean>(HIDE_COIN_PREFERENCE.key) ?? false;

async function seriesPage(
  page: number,
  query: Record<string, unknown>,
  keep: (s: SeriesDto) => boolean,
): Promise<MangaPage> {
  const { items, count } = await runQuery<SeriesDto>('Series', {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    ...query,
  });
  return {
    items: items.filter((s) => keep(s) && !(hideCoin() && s.onlyTransactional)).map(toSummary),
    hasNextPage: count >= PAGE_SIZE,
  };
}

const param = (url: string, name: string) => Number(new RegExp(`[?&]${name}=(\\d+)`).exec(url)?.[1]);

export default defineExtension({
  preferences: () => [USER_TOKEN_PREFERENCE, HIDE_COIN_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) =>
      seriesPage(
        page,
        { select: select(SERIES_FIELDS), where: fieldFilter('enabled', 'EQUAL', { booleanValue: true }) },
        () => true,
      ),
    // Firestore wants an index for filter + orderBy, so "enabled" is filtered here instead.
    getLatest: (page) =>
      seriesPage(
        page,
        {
          select: select([...SERIES_FIELDS, 'enabled']),
          orderBy: [{ direction: 'DESCENDING', field: { fieldPath: 'updatedAt' } }],
        },
        (s) => s.enabled === true,
      ),
    search(query: string, page: number): Promise<MangaPage> {
      const q = query.trim().toLowerCase();
      return seriesPage(
        page,
        {
          select: select(SERIES_FIELDS),
          where: and(
            fieldFilter('enabled', 'EQUAL', { booleanValue: true }),
            fieldFilter('name_lowercase', 'GREATER_THAN_OR_EQUAL', { stringValue: q }),
            fieldFilter('name_lowercase', 'LESS_THAN_OR_EQUAL', { stringValue: `${q}` }),
          ),
        },
        () => true,
      );
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const s = await getDocument<SeriesDto>(`Series/${param(manga.url, 'series')}`, SERIES_FIELDS);
      return {
        ...toSummary(s),
        author: s.authors?.map((a) => a.name).join(', ') || undefined,
        description: s.description || undefined,
        genres: s.genres?.map((g) => g.name) ?? [],
        status: status(s),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const seriesId = param(manga.url, 'series');
      const [series, { items }, user] = await Promise.all([
        getDocument<SeriesDto>(`Series/${seriesId}`, [
          'maxFreeChapterNumber',
          'maxMeteredReadingChapterNumber',
          'onlyTransactional',
        ]),
        runQuery<ChapterDto>(`Series/${seriesId}/chapters`, {
          select: select([
            'alwaysFree',
            'enabled',
            'id',
            'seriesId',
            'chapterNumber',
            'name',
            'createdAt',
            'onlyTransactional',
            'type',
          ]),
          orderBy: [{ direction: 'DESCENDING', field: { fieldPath: 'chapterNumber' } }],
        }),
        userToken().then((u) => getDocument<{ isSubscribed?: boolean }>(`Users/${u}`, ['isSubscribed'])),
      ]);
      const subscribed = user.isSubscribed === true;
      const metered = Number.parseFloat(series.maxMeteredReadingChapterNumber ?? '') || 0;
      return items.flatMap((c): Chapter[] => {
        if (c.enabled !== true || c.chapterNumber == null) return [];
        const free = c.alwaysFree === true || c.chapterNumber <= (series.maxFreeChapterNumber ?? 0);
        const coin =
          c.onlyTransactional === true || (series.onlyTransactional === true && c.type === 'volume' && !free);
        if (hideCoin() && coin) return [];
        const mark = coin ? ' 🪙' : free || subscribed ? '' : c.chapterNumber <= metered ? ' 🕒' : ' 🔒';
        return [
          {
            url: `/?series=${c.seriesId}&chapter=${c.id}`,
            name: `${c.name ?? ''}${mark}`,
            number: c.chapterNumber,
            uploadedAt: c.createdAt,
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const pages = await postJson<{ pageNumber: number; uri: string }[]>(
        `${FUNCTIONS_URL}/page/${param(chapter.url, 'series')}/${param(chapter.url, 'chapter')}`,
        { idToken: await idToken() },
      );
      return pages.map((p) => ({ index: p.pageNumber - 1, imageUrl: p.uri })).sort((a, b) => a.index - b.index);
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/catalog\/[^?#]+\?(?:[^#]*&)?series=(\d+))/i.exec(url.trim());
      if (!match || match[1]!.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: `${match[2]!.split('?')[0]}?series=${match[3]}`, title: '' };
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
