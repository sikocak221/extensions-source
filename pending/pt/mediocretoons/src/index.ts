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
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://mediocrescan.com';
const API_URL = 'https://back2.mediocrescan.com';
const CDN_URL = 'https://cdn.mediocrescan.com';
const LOGIN_PATH = '/auth/login';
const LIMIT = 24;
const POPULAR_FORMATS = '1,4,5,8,9,13';
const POPULAR_SORT = 'view_geral';
const LATEST_FORMAT = '5';
const EMAIL_PREF = 'email';
const PASSWORD_PREF = 'password';
const TOKEN_KEY = 'token';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const MISSING_CREDENTIALS_ERROR = 'Configure e-mail e senha nas preferências da extensão';
const LOGIN_FAILED_ERROR = 'Falha no login. Verifique o e-mail e a senha nas preferências da extensão.';
const VIP_ONLY_ERROR = 'O site restringe o acesso a assinantes VIP';

async function login(): Promise<string> {
  const email = (prefs.get<string>(EMAIL_PREF) ?? '').trim();
  const password = prefs.get<string>(PASSWORD_PREF) ?? '';
  if (!email || !password) throw new Error(MISSING_CREDENTIALS_ERROR);
  const response = await http.post<{ token?: string; message?: string }>(
    API_URL + LOGIN_PATH,
    { json: { email, senha: password } },
    { headers, responseType: 'json' },
  );
  const token = response.body?.token;
  if (response.status >= 400 || !token) {
    const message = response.body?.message;
    throw new Error(message ? `${LOGIN_FAILED_ERROR} Resposta do site: ${message}` : LOGIN_FAILED_ERROR);
  }
  await storage.set(TOKEN_KEY, token);
  return token;
}

/** Authenticated api call: logs in when there is no token and renews it on a 401. */
async function api<T>(url: string): Promise<T> {
  let token = (await storage.get<string>(TOKEN_KEY)) || (await login());
  let response = await http.get<T>(url, {
    headers: { ...headers, Authorization: `Bearer ${token}` },
    responseType: 'json',
  });
  if (response.status === 401) {
    token = await login();
    response = await http.get<T>(url, {
      headers: { ...headers, Authorization: `Bearer ${token}` },
      responseType: 'json',
    });
  }
  if (response.status === 403) throw new Error(VIP_ONLY_ERROR);
  return response.body;
}

interface MangaDto {
  id: number;
  nome: string;
  imagem?: string | null;
}
interface MangaListDto {
  data: MangaDto[];
  pagination: { hasNextPage: boolean };
}
interface DetailsDto {
  obr_id: number;
  obr_nome: string;
  obr_imagem?: string | null;
  obr_descricao?: string | null;
  obr_status?: string | null;
  tags?: { tag_nome: string }[];
  capitulos: {
    cap_id: number;
    cap_nome: string;
    cap_num: number;
    cap_lancado_em?: string | null;
    cap_criado_em?: string | null;
  }[];
}

// Same url format as 1.4, so existing library entries and chapters keep matching.
const summary = (m: MangaDto): MangaSummary => ({
  url: `/obra/${m.id}`,
  title: m.nome,
  thumbnailUrl: m.imagem ? `${CDN_URL}/obras/${m.id}/${m.imagem}` : undefined,
});

const toPage = (list: MangaListDto): MangaPage => ({
  items: list.data.map(summary),
  hasNextPage: list.pagination.hasNextPage,
});

function searchUrl(page: number, sort: string | undefined, query = '', filters: FilterState = {}): string {
  const format = typeof filters.formato === 'string' && filters.formato ? filters.formato : POPULAR_FORMATS;
  const params = [`limite=${LIMIT}`, `pagina=${page}`, 'temCapitulo=true', `formato=${format}`];
  if (sort) params.push(`ordenarPor=${sort}`);
  if (query.trim()) params.push(`string=${encodeURIComponent(query)}`);
  if (typeof filters.status === 'string' && filters.status) params.push(`status=${filters.status}`);
  return `${API_URL}/obras/buscar?${params.join('&')}`;
}

const select = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  default: options[0]![1],
  options: options.map(([l, value]) => ({ label: l, value })),
});

const STATUS: Record<string, MangaStatus> = {
  em_lancamento: 'ongoing',
  finalizado: 'completed',
  hiato: 'hiatus',
  cancelado: 'cancelled',
};

export default defineExtension({
  preferences: () => [
    {
      type: 'text',
      key: EMAIL_PREF,
      label: 'E-mail',
      description: 'E-mail da conta usada para acessar o site',
      default: '',
    },
    {
      type: 'text',
      key: PASSWORD_PREF,
      label: 'Senha',
      description: 'Senha da conta usada para acessar o site',
      default: '',
    },
  ],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page) {
      return toPage(await api<MangaListDto>(searchUrl(page, POPULAR_SORT)));
    },
    async getLatest(page) {
      const url = `${API_URL}/obras/atualizadas-recentes?limit=${LIMIT}&offset=${(page - 1) * LIMIT}&formato=${LATEST_FORMAT}`;
      return toPage(await api<MangaListDto>(url));
    },
    getFilters: (): Filter[] => [
      select('formato', 'Formato', [
        ['Todos', ''],
        ['Shoujo', '4'],
        ['Comic', '5'],
        ['Yaoi', '8'],
        ['Yuri', '9'],
        ['Hentai', '10'],
      ]),
      select('status', 'Status', [
        ['Todos', ''],
        ['Em lançamento', '1'],
        ['Finalizado', '2'],
        ['Hiato', '3'],
        ['Cancelado', '4'],
      ]),
      select('sort', 'Ordenar por', [
        ['Mais recentes', 'criada_em_desc'],
        ['Mais populares', 'view_geral'],
        ['A-Z', 'nome'],
      ]),
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const sort = typeof filters.sort === 'string' && filters.sort ? filters.sort : undefined;
      return toPage(await api<MangaListDto>(searchUrl(page, sort, query, filters)));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const d = await api<DetailsDto>(`${API_URL}/obras/${manga.url.replace('/obra/', '')}`);
      return {
        url: `/obra/${d.obr_id}`,
        title: d.obr_nome,
        thumbnailUrl: d.obr_imagem ? `${CDN_URL}/obras/${d.obr_id}/${d.obr_imagem}` : undefined,
        description: d.obr_descricao ?? undefined,
        genres: (d.tags ?? []).map((t) => t.tag_nome),
        status: STATUS[(d.obr_status ?? '').toLowerCase()] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const d = await api<DetailsDto>(`${API_URL}/obras/${manga.url.replace('/obra/', '')}`);
      return d.capitulos
        .map((c) => {
          const time = Date.parse(c.cap_lancado_em ?? c.cap_criado_em ?? '');
          return {
            url: `/capitulo/${c.cap_id}`,
            name: c.cap_nome,
            number: c.cap_num,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          };
        })
        .sort((a, b) => b.number - a.number);
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const d = await api<{ cap_uuid: string; cap_num: number; obr_id: number }>(
        `${API_URL}/capitulos/${chapter.url.replace('/capitulo/', '')}`,
      );
      const num = String(d.cap_num).replace(/\.0$/, '');
      const pages = await api<{ ordem: number; url: string }[]>(
        `${CDN_URL}/obras/${d.obr_id}/capitulos/${num}/${d.cap_uuid}.json`,
      );
      return [...pages]
        .sort((a, b) => a.ordem - b.ordem)
        .map((p, index) => ({ index, imageUrl: `${CDN_URL}/${p.url}` }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      // The site's own links point to the www host.
      const match = /^https?:\/\/([^/?#]+)\/obra\/(\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL)
        ? { url: `/obra/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
