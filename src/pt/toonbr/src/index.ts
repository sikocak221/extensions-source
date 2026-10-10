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

const BASE_URL = 'https://beta.toonbr.com';
const API_URL = 'https://api.toonbr.com';
const CDN_URL = 'https://cdn2.toonbr.com';
const PAGE_LIMIT = 150;
const PREF_EMAIL = 'toonbr_email';
const PREF_PASSWORD = 'toonbr_password';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const CATEGORIES: [string, string][] = [
  ['Todas', ''],
  ['Ação', '9c302e17-a1df-42f7-84f9-8de76bc97afb'],
  ['Artes Marciais', '016c5ed9-8471-4a53-ad4e-22108ddc7cef'],
  ['Aventura', '02aa6ee2-1862-4044-a81c-7417b588d096'],
  ['Comédia', '148ba9b3-1353-430e-ab3d-e845cfb35a77'],
  ['Cultivo', '541d75e5-233d-42f7-8a9e-77f3f0674c25'],
  ['Drama', 'e36a8377-378f-472c-a622-a36ed0de493a'],
  ['Dungeons', 'c6f1d753-cfd4-4e5c-bbfa-45a742d416c8'],
  ['Fantasia', '152d8043-499f-46af-bcb1-fa85d4609b06'],
  ['Ficção Científica', '15b9f655-752a-43d2-be81-fcade4b88600'],
  ['Garota Monstro', '8881c693-f64d-4c7c-854e-d36d766e4c94'],
  ['Guerra', '276ad40f-6a47-4e95-86b5-edd05a13758e'],
  ['Harém', '804d6052-4b08-4690-b068-bb0c419bd3e7'],
  ['Histórico', 'a25e9dc7-4542-4e12-bc62-13b26012f817'],
  ['Isekai', '7fc49228-f081-4829-bae0-124c72b6d3b1'],
  ['Josei', '56d5c790-8cdb-4856-a7c0-a05d9f9ac27f'],
  ['Magia', 'bcf9fbae-b594-45ef-88d3-2238e6e69d0b'],
  ['Manhua', '630647d8-0644-479d-bb4f-dd93bdc2f260'],
  ['Mistério', '78285b9f-1ffa-4f8e-a364-1f5c474e0c42'],
  ['Murim', 'f023cc3a-e739-434f-b9a7-ebdb6820012e'],
  ['Novel', '36737e8e-bd53-49c6-9778-b068a7e1af33'],
  ['Overpower', 'b7d6eaa1-9f63-4954-9337-7d3ff8db28da'],
  ['Poderes', '798e2caa-b993-4d02-82f6-9ca1670b6f9c'],
  ['Psicológico', 'aab7e8c0-9947-4940-9df1-66fab2cfa9e0'],
  ['Reencarnação', '015f5641-f9ab-49b5-8e40-7e3ab11d6841'],
  ['Regressão', '378bf675-df29-4e83-969c-baa9cb704ebe'],
  ['Retorno', 'd551ebe5-18bc-4e43-b8dc-b8cc0ca338e9'],
  ['Romance', '1572cea3-6b8d-4384-869e-98f13eeb0b72'],
  ['Seinen', '201ba651-1538-4ba9-8d38-2bf27ef021fa'],
  ['Shoujo', 'b555b360-813b-4996-886c-f6c2b18f1627'],
  ['Shounen', '0c496918-8310-4faa-a578-5146869beaf1'],
  ['Sistema', '9b34cfee-ab0f-4111-b65f-f124f1efd4e5'],
  ['Slice of Life', '9b4eac41-405d-4add-92bb-ca4de396d06e'],
  ['Sobrenatural', '4640673a-1697-4a1b-bc0f-449b85088639'],
  ['Superpoderes', '575d014e-fb7a-43fc-9f9d-883fdd789c90'],
  ['Terror', 'b67c12d8-89ae-491a-b902-d616c6d52c49'],
  ['Torre', 'a8beff9f-bc9f-45f7-b733-487d7365b153'],
  ['Transformação', '392a32a3-0bef-4f97-bb2f-5854f1701a21'],
  ['Tragédia', 'f1189c95-a9ad-43cd-9973-85f1c9000953'],
  ['Vilão', '22bce1fa-5c06-45f1-a366-99f4556646fa'],
  ['Vingança', '49073ee7-379c-4c59-9379-757b5e9abd32'],
  ['Wuxia', '4e7b53c7-cc94-4967-859c-6be94bf3a52e'],
];

interface ChapterDto {
  id: string;
  title: string;
  chapterNumber?: number | null;
  createdAt?: string | null;
  pages?: { imageUrl?: string | null }[] | null;
}
interface MangaDto {
  title: string;
  slug: string;
  description?: string | null;
  status?: string | null;
  coverImage?: string | null;
  chapters?: ChapterDto[] | null;
}

let session: { key: string; token: string } | undefined;

/** Logs in with the account of the preferences (if any); the token goes in a cookie. */
async function authHeaders(): Promise<Record<string, string>> {
  const email = prefs.get<string>(PREF_EMAIL) ?? '';
  const password = prefs.get<string>(PREF_PASSWORD) ?? '';
  if (!email || !password) return headers;
  const key = `${email}\n${password}`;
  if (session?.key !== key) {
    try {
      const response = await http.post<{ token: string }>(
        `${API_URL}/api/auth/login`,
        { json: { email, password } },
        { headers, responseType: 'json' },
      );
      session = response.status < 400 && response.body?.token ? { key, token: response.body.token } : undefined;
    } catch {
      session = undefined;
    }
  }
  return session ? { ...headers, Cookie: `token=${session.token}` } : headers;
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(API_URL + path, { headers: await authHeaders(), responseType: 'json' })).body;
}

const summary = (m: MangaDto): MangaSummary => ({
  url: `/manga/${m.slug}`,
  title: m.title,
  thumbnailUrl: m.coverImage ? CDN_URL + m.coverImage : undefined,
});

const slugOf = (url: string) => url.slice(url.lastIndexOf('/') + 1);

export default defineExtension({
  preferences: () => [
    {
      type: 'text',
      key: PREF_EMAIL,
      label: '📧 Email',
      description: '⚠️ Os dados inseridos nessa seção serão usados somente para realizar o login na fonte',
      default: '',
    },
    {
      type: 'text',
      key: PREF_PASSWORD,
      label: '🔑 Senha',
      description: '⚠️ Os dados inseridos nessa seção serão usados somente para realizar o login na fonte',
      default: '',
    },
  ],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      return {
        items: (await api<MangaDto[]>(`/api/manga/popular?limit=${PAGE_LIMIT}`)).map(summary),
        hasNextPage: false,
      };
    },
    async getLatest(): Promise<MangaPage> {
      return {
        items: (await api<MangaDto[]>(`/api/manga/latest?limit=${PAGE_LIMIT}`)).map(summary),
        hasNextPage: false,
      };
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'category',
        label: 'Categoria',
        default: '',
        options: CATEGORIES.map(([label, value]) => ({ label, value })),
      },
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      let path = `/api/manga?page=${page}&limit=${PAGE_LIMIT}`;
      if (query.trim()) path += `&search=${encodeURIComponent(query)}`;
      if (typeof filters.category === 'string' && filters.category) path += `&categoryId=${filters.category}`;
      const result = await api<{ data: MangaDto[] }>(path);
      return { items: result.data.map(summary), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = await api<MangaDto>(`/api/manga/${slugOf(manga.url)}`);
      return {
        ...summary(m),
        description: m.description ?? undefined,
        status: (m.status === 'ONGOING'
          ? 'ongoing'
          : m.status === 'COMPLETED'
            ? 'completed'
            : 'unknown') as MangaStatus,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const m = await api<MangaDto>(`/api/manga/${slugOf(manga.url)}`);
      return (m.chapters ?? [])
        .map((c) => {
          const time = c.createdAt ? Date.parse(c.createdAt) : Number.NaN;
          return {
            url: `/chapter/${c.id}`,
            name: c.chapterNumber !== null && c.chapterNumber !== undefined ? `Capítulo ${c.chapterNumber}` : c.title,
            number: c.chapterNumber ?? 0,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          };
        })
        .sort((a, b) => b.number - a.number);
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const dto = await api<ChapterDto>(`/api/chapter/${slugOf(chapter.url)}`);
      const pages: Page[] = [];
      (dto.pages ?? []).forEach((p, index) => {
        if (p.imageUrl) pages.push({ index, imageUrl: CDN_URL + p.imageUrl });
      });
      return pages;
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => ('name' in item ? `${BASE_URL}/read/${slugOf(item.url)}` : BASE_URL + item.url),
  }),
});
