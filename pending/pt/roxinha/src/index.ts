import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type SortValue,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://roxinha.online';
const API_URL = `${BASE_URL}/api`;
const EMAIL_PREF = 'email';
const PASSWORD_PREF = 'password';
const LOGIN_HINT = 'Informe o e-mail e a senha da sua conta da Roxinha para ler os capítulos';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface ChapterDto {
  id: number;
  chapterNumber?: number | null;
  title?: string | null;
  createdAt?: string | null;
}
interface MangaDto {
  id: number;
  title: string;
  cover?: string | null;
  author?: string | null;
  description?: string | null;
  status?: string | null;
  genres?: string | null;
  chapters?: ChapterDto[] | null;
}

let token: string | undefined;
let tokenFor = '';

async function login(): Promise<string | undefined> {
  const email = (prefs.get<string>(EMAIL_PREF) ?? '').trim();
  const password = prefs.get<string>(PASSWORD_PREF) ?? '';
  if (!email || !password) return undefined;
  if (token && tokenFor === `${email}\n${password}`) return token;
  const response = await http.post<{ token?: string; error?: string }>(
    `${API_URL}/auth/login`,
    { json: { email, password, rememberMe: true } },
    { headers, responseType: 'json' },
  );
  if (response.status >= 400 || !response.body?.token)
    throw new Error(response.body?.error ?? `Erro HTTP ${response.status}`);
  token = response.body.token;
  tokenFor = `${email}\n${password}`;
  return token;
}

/** GET with the account's token when credentials are set; a 401 renews the token once. */
async function request<T>(path: string, extra: Record<string, string> = {}) {
  const send = async (renew: boolean) => {
    if (renew) token = undefined;
    const auth = await login();
    return http.get<T>(API_URL + path, {
      headers: { ...headers, ...extra, ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      responseType: 'json',
    });
  };
  const response = await send(false);
  return response.status === 401 && token ? send(true) : response;
}

async function api<T>(path: string): Promise<T> {
  return (await request<T>(path)).body;
}

const STATUS: Record<string, MangaStatus> = { ongoing: 'ongoing', completed: 'completed' };

const idOf = (url: string) => url.split('/').pop() ?? '';

const summary = (m: MangaDto): MangaSummary => ({
  url: `/manga/${m.id}`,
  title: m.title,
  thumbnailUrl: m.cover ? BASE_URL + m.cover : undefined,
});

const SORTS = [
  { value: 'title', label: 'Título' },
  { value: 'updated', label: 'Atualização' },
  { value: 'views', label: 'Visualizações' },
  { value: 'rating', label: 'Avaliação' },
];

async function list(page: number, query: string, sort: SortValue, extra: string[] = []): Promise<MangaPage> {
  const params = [
    'limit=24',
    `offset=${(page - 1) * 24}`,
    'mode=default',
    ...(query.trim() ? [`q=${encodeURIComponent(query)}`] : []),
    `sort=${sort.value}`,
    `order=${sort.ascending ? 'ASC' : 'DESC'}`,
    ...extra,
  ];
  const dto = await api<{ mangas?: MangaDto[]; hasMore?: boolean }>(`/manga/search/advanced?${params.join('&')}`);
  return { items: (dto.mangas ?? []).map(summary), hasNextPage: dto.hasMore ?? false };
}

const select = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  default: '',
  options: options.map(([l, value]) => ({ label: l, value })),
});

export default defineExtension({
  preferences: () => [
    { type: 'text', key: EMAIL_PREF, label: 'E-mail', description: LOGIN_HINT, default: '' },
    { type: 'text', key: PASSWORD_PREF, label: 'Senha', description: LOGIN_HINT, default: '' },
  ],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(page, '', { value: 'views', ascending: false }),
    getLatest: (page) => list(page, '', { value: 'updated', ascending: false }),
    getFilters: (): Filter[] => [
      { type: 'sort', id: 'sort', label: 'Ordenar por', options: SORTS, default: { value: 'views', ascending: false } },
      select('status', 'Status', [
        ['Todos', ''],
        ['Em andamento', 'ongoing'],
        ['Concluído', 'completed'],
      ]),
      select('type', 'Tipo', [
        ['Todos', ''],
        ['Manga', 'manga'],
        ['Manhua', 'manhua'],
        ['Manhwa', 'manhwa'],
        ['Webtoon', 'webtoon'],
      ]),
    ],
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const extra: string[] = [];
      for (const key of ['status', 'type'])
        extra.push(`${key}=${typeof filters[key] === 'string' ? filters[key] : ''}`);
      const sort = (filters.sort as SortValue | undefined) ?? { value: 'views', ascending: false };
      return list(page, query, sort, extra);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = await api<MangaDto>(`/manga/${idOf(manga.url)}`);
      return {
        ...summary(m),
        author: m.author ?? undefined,
        description: m.description ?? undefined,
        genres: m.genres ? m.genres.split(',').map((g) => g.trim()) : [],
        status: STATUS[m.status ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const m = await api<MangaDto>(`/manga/${idOf(manga.url)}`);
      return (m.chapters ?? [])
        .map((c) => {
          const number = c.chapterNumber ?? -1;
          const title = c.title?.trim();
          const time = c.createdAt ? Date.parse(c.createdAt) : Number.NaN;
          return {
            url: `/manga/chapter/${c.id}`,
            name:
              title && Number.isNaN(Number(title))
                ? title
                : `Capítulo ${c.chapterNumber !== null && c.chapterNumber !== undefined ? c.chapterNumber : ''}`.trim(),
            number,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          };
        })
        .sort((a, b) => b.number - a.number);
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const path = `/manga/chapter/${idOf(chapter.url)}`;
      const access = await request<{ ticket?: string; error?: string }>(`${path}/access`);
      if (access.status >= 400 || !access.body?.ticket) {
        const message = access.body?.error ?? `Erro HTTP ${access.status}`;
        throw new Error(access.status === 401 ? `${message}. ${LOGIN_HINT}` : message);
      }
      const dto = (await request<{ pages?: string[] }>(path, { 'x-chapter-access': access.body.ticket })).body;
      return (dto.pages ?? []).map((url, index) => ({ index, imageUrl: BASE_URL + url }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/(\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
