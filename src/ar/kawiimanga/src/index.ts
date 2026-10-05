import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://kawaiimanga.org';
const API_URL = 'https://manga-api.kawaii-anime.com/api/manga';
const APP_KEY = 'km_2026_live';

interface MangaDto {
  slug: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  author?: string | null;
  artist?: string | null;
  type?: string | null;
  status?: string | null;
  genres?: string[];
  chapters?: { id: string; title: string; number: number; createdAt: string }[];
}

let token: { value: string; expires: number } | undefined;

// The API wants a short-lived token fetched with the public app key.
async function getToken(): Promise<string | undefined> {
  if (token && token.expires > Date.now()) return token.value;
  try {
    const response = await http.get(`${API_URL}/token`, { headers: { 'x-app-key': APP_KEY } });
    const data = JSON.parse(response.body) as { token?: string; expiresIn?: number };
    if (!data.token) return undefined;
    token = { value: data.token, expires: Date.now() + ((data.expiresIn ?? 0) - 120) * 1000 };
    return token.value;
  } catch {
    return undefined;
  }
}

async function api<T>(query: string): Promise<T> {
  const call = async () => {
    const value = await getToken();
    return http.request<string>({
      url: `${API_URL}/own?${query}`,
      headers: { 'User-Agent': USER_AGENT, 'x-app-key': APP_KEY, ...(value ? { 'x-app-token': value } : {}) },
    });
  };
  let response = await call();
  if (response.status === 401) {
    token = undefined;
    response = await call();
  }
  if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
  return JSON.parse(response.body) as T;
}

const valid = (value?: string | null) =>
  value && value.trim() && value.toLowerCase() !== 'unknown' ? value : undefined;

const toSummary = (dto: MangaDto): MangaSummary => ({
  url: `/manga/${dto.slug}`,
  title: dto.title,
  thumbnailUrl: dto.coverUrl ?? undefined,
});

async function list(query: string): Promise<MangaPage> {
  const data = await api<{ results: MangaDto[]; hasMore?: boolean }>(query);
  return { items: data.results.map(toSummary), hasNextPage: data.hasMore ?? false };
}

const slugOf = (url: string) => url.replace(/^\/manga\//, '').replace(/\/.*$/, '');

async function series(manga: MangaSummary): Promise<MangaDto> {
  return api<MangaDto>(`action=series&slug=${encodeURIComponent(slugOf(manga.url))}`);
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`action=browse&page=${page}&sort=views`),
    getLatest: (page) => list(`action=browse&page=${page}`),
    search: (query) => list(`action=search&q=${encodeURIComponent(query)}`),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await series(manga);
      const status: MangaStatus =
        dto.status === 'ongoing' || dto.status === 'coming_soon'
          ? 'ongoing'
          : dto.status === 'completed'
            ? 'completed'
            : dto.status === 'cancelled' || dto.status === 'dropped'
              ? 'cancelled'
              : 'unknown';
      const type = { manga: 'Manga', manhua: 'Manhua', manhwa: 'Manhwa' }[dto.type as 'manga'];
      const genres = [...new Set([...(type ? [type] : []), ...(dto.genres ?? [])])];
      return {
        ...toSummary(dto),
        author: valid(dto.author),
        artist: valid(dto.artist),
        description: dto.description || undefined,
        genres: genres.length ? genres : undefined,
        status,
        type: dto.type === 'manga' || dto.type === 'manhua' || dto.type === 'manhwa' ? dto.type : undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const dto = await series(manga);
      return (dto.chapters ?? []).map((chapter) => ({
        url: `/reader/${dto.slug}/${chapter.number}#${chapter.id}`,
        name: `الفصل ${chapter.number}${`الفصل ${chapter.number}` !== chapter.title ? ` - ${chapter.title}` : ''}`,
        number: chapter.number,
        uploadedAt: Date.parse(chapter.createdAt) || undefined,
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const chapterId = chapter.url.slice(chapter.url.lastIndexOf('#') + 1);
      const data = await api<{ pages: string[] }>(`action=pages&chapterId=${encodeURIComponent(chapterId)}`);
      return data.pages.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?kawaiimanga\.org\/manga\/([^/?#]+)/i.exec(url.trim());
      return match ? { url: `/manga/${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url.replace(/#.*$/, '')}`,
  }),
});
