import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, withQuery } from './common/utils';

const BASE_URL = 'https://sacachispa.site';
const API = 'https://api.sacachispa.site/api';
const CDN = 'https://cdn.sacachispa.site';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const api = async <T>(url: string) => (await http.get<T>(url, { headers, responseType: 'json' })).body;
const coverUrl = (path: string) => (path.startsWith('http') ? path : `${CDN}/${path.replace(/^\//, '')}`);

// Manga urls are "/manga/<id>/<slug>", chapter urls "/read/<release id>".
async function list(page: number, endpoint: string, query?: string): Promise<MangaPage> {
  const data = await api<{
    data: { id: string; slug: string; title: string; cover?: string | null }[];
    pagination: { page: number; pages: number };
  }>(withQuery(endpoint, { page: String(page), limit: '24', q: query }));
  return {
    items: data.data.map((m) => ({
      url: `/manga/${m.id}/${m.slug}`,
      title: m.title,
      thumbnailUrl: m.cover ? coverUrl(m.cover) : undefined,
    })),
    hasNextPage: data.pagination.page < data.pagination.pages,
  };
}

const idOf = (url: string) => url.split('/')[2] ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(page, `${API}/manga`),
    search: (query, page) => list(page, `${API}/manga/search`, query.trim()),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const d = (
        await api<{
          data: {
            title: string;
            status: string;
            authors?: { name: string }[];
            artists?: { name: string }[];
            genres?: { name: string }[];
            covers?: { image: string }[];
            synopses?: { synopsis: string }[];
          };
        }>(`${API}/manga/${idOf(manga.url)}`)
      ).data;
      const statuses: Record<string, MangaStatus> = {
        ONGOING: 'ongoing',
        COMPLETED: 'completed',
        HIATUS: 'hiatus',
        DROPPED: 'cancelled',
      };
      return {
        url: manga.url,
        title: d.title,
        thumbnailUrl: d.covers?.[0] ? coverUrl(d.covers[0].image) : manga.thumbnailUrl,
        author: d.authors?.map((a) => a.name).join(', ') || undefined,
        artist: d.artists?.map((a) => a.name).join(', ') || undefined,
        genres: d.genres?.map((g) => g.name),
        description: d.synopses?.[0]?.synopsis,
        status: statuses[d.status] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const chapters: Chapter[] = [];
      for (let page = 1, last = 1; page <= last; page++) {
        const data = await api<{
          data: { id: string; chapter: { chapter: string; title?: string | null }; publishedAt: string }[];
          pagination: { pages: number };
        }>(`${API}/releases?mangaId=${idOf(manga.url)}&page=${page}&limit=500`);
        last = data.pagination.pages;
        for (const r of data.data) {
          const time = Date.parse(r.publishedAt);
          chapters.push({
            url: `/read/${r.id}`,
            name: `Chapter ${r.chapter.chapter}${r.chapter.title?.trim() ? ` - ${r.chapter.title}` : ''}`,
            number: Number(r.chapter.chapter),
            uploadedAt: Number.isFinite(time) ? time : undefined,
          });
        }
      }
      return chapters.sort((a, b) => (b.number || -1) - (a.number || -1));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.request<{ data?: { items?: { url: string }[] }; error?: { message?: string } }>({
        url: `${API}/releases/${chapter.url.split('/').pop()}/pages`,
        headers,
        responseType: 'json',
      });
      if (response.status >= 400) throw new Error(response.body.error?.message ?? `HTTP ${response.status}`);
      return (response.body.data?.items ?? []).map((p, index) => ({ index, imageUrl: p.url }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+\/[^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
