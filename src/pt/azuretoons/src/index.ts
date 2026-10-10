import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities, hostOf, htmlToText, relativeUrl } from './common/utils';

const BASE_URL = 'https://azuretoons.com';
const API = `${BASE_URL}/api`;
const EMAIL_PREF = 'email';
const PASSWORD_PREF = 'password';

interface ChapterDto {
  chapterNumber?: number;
  title?: string | null;
  createdAt?: string | null;
}
interface MangaDto {
  title: string;
  slug: string;
  coverUrl?: string | null;
  description?: string | null;
  status?: string | null;
  chapters?: ChapterDto[];
  viewCount?: number;
}

const baseHeaders: Record<string, string> = {
  'User-Agent': USER_AGENT,
  Referer: `${BASE_URL}/`,
  Accept: '*/*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  Pragma: 'no-cache',
};

let token: { value: string; expires: number } | undefined;

/** Logs in with the email/password preferences (optional); the token is kept in memory. */
async function authHeaders(): Promise<Record<string, string>> {
  const email = prefs.get<string>(EMAIL_PREF)?.trim();
  const password = prefs.get<string>(PASSWORD_PREF);
  if (!email || !password) return baseHeaders;
  if (!token || token.expires < Date.now()) {
    token = undefined;
    try {
      const response = await http.post<{ access_token?: string; token?: string; expires_in?: number }>(
        `${API}/auth/login`,
        { json: { identifier: email, password } },
        { headers: { ...baseHeaders, Accept: 'application/json' }, responseType: 'json' },
      );
      const value = response.body.access_token ?? response.body.token;
      if (value) token = { value, expires: Date.now() + (response.body.expires_in ?? 3600) * 1000 };
    } catch {
      // Not logged in: anonymous requests.
    }
  }
  return token ? { ...baseHeaders, Authorization: `Bearer ${token.value}` } : baseHeaders;
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(`${API}${path}`, { headers: await authHeaders(), responseType: 'json' })).body;
}

const summary = (m: MangaDto): MangaSummary => ({
  url: `/obra/${m.slug}`,
  title: m.title,
  thumbnailUrl: m.coverUrl || undefined,
});

const STATUS: Record<string, MangaStatus> = {
  em_lancamento: 'ongoing',
  'em andamento': 'ongoing',
  ativo: 'ongoing',
  concluido: 'completed',
  concluído: 'completed',
  hiato: 'hiatus',
  cancelado: 'cancelled',
};

const slugOf = (url: string) => /\/obra\/([^/?#]+)/.exec(url)?.[1] ?? '';

export default defineExtension({
  preferences: () => [
    { type: 'text', key: EMAIL_PREF, label: 'Email', description: 'Email para login automático', default: '' },
    { type: 'text', key: PASSWORD_PREF, label: 'Senha', description: 'Senha para login automático', default: '' },
  ],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const list = await api<MangaDto[]>('/obras');
      return { items: [...list].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0)).map(summary), hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      return { items: (await api<MangaDto[]>('/obras')).map(summary), hasNextPage: false };
    },
    async search(query: string): Promise<MangaPage> {
      const q = query.toLowerCase();
      const list = (await api<MangaDto[]>('/obras')).map(summary);
      return { items: q ? list.filter((m) => m.title.toLowerCase().includes(q)) : list, hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await api<MangaDto>(`/obras/slug/${slugOf(manga.url)}`);
      return {
        ...summary(dto),
        description: dto.description ? htmlToText(dto.description) : undefined,
        status: STATUS[(dto.status ?? '').toLowerCase()] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const dto = await api<MangaDto>(`/obras/slug/${slugOf(manga.url)}`);
      const seen = new Set<string>();
      return (dto.chapters ?? [])
        .map((c) => {
          const number = c.chapterNumber ?? 0;
          const time = c.createdAt ? Date.parse(c.createdAt) : Number.NaN;
          return {
            url: `/obra/${dto.slug}/capitulo/${number}`,
            name: c.title?.trim() ? decodeEntities(c.title) : `Capítulo ${String(number).replace(/\.0$/, '')}`,
            number,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          };
        })
        .filter((c) => !seen.has(c.url) && seen.add(c.url))
        .sort((a, b) => b.number - a.number);
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = chapter.url.split('/capitulo/')[1] ?? '';
      const dto = await api<{ images?: string[] }>(`/chapters/read/${slugOf(chapter.url)}/${id}`);
      return (dto.images ?? []).map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => baseHeaders,
    resolveUrl(url: string): MangaSummary | null {
      const slug = slugOf(url);
      return hostOf(url) === hostOf(BASE_URL) && slug ? { url: `/obra/${slug}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
