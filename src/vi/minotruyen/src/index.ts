import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type TileOp,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, findRscObject, hostOf } from './common/utils';
import { imageSize } from './image';

const BASE_URL = 'https://minotruyenv5.xyz';
const DEFAULT_API = 'https://api.cloudkk-v2.xyz/api';
const DRM_KEY = '3141592653589793';
const DRM_PREFIX = '#mino-v1|';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

// The api host moves (cloudkk-v1 → v2 …); the current one is in the site's bundle as NEXT_PUBLIC_API_URL.
let apiUrl: string | undefined;
async function api<T>(path: string): Promise<T> {
  if (!apiUrl) {
    apiUrl = DEFAULT_API;
    const probe = await http
      .request({ url: `${DEFAULT_API}/books?take=1&category=manga`, headers })
      .catch(() => undefined);
    if (!probe || probe.status >= 300) {
      const home = (await http.get(BASE_URL, { headers })).body;
      for (const src of [...home.matchAll(/src="([^"]*chunks[^"]*\.js)"/g)].map((m) => m[1]!)) {
        const js =
          (await http.get(src.startsWith('http') ? src : BASE_URL + src, { headers }).catch(() => undefined))?.body ??
          '';
        const found = /NEXT_PUBLIC_API_URL\W+"(https?:\/\/[^"]+)"/.exec(js)?.[1];
        if (found) {
          apiUrl = `${found}/api`;
          break;
        }
      }
    }
  }
  return (await http.get<T>(apiUrl + path, { headers, responseType: 'json' })).body;
}

/** ibyteimg "/obj/…" covers need the resize template to load. */
function thumbnail(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const full = url.startsWith('//') ? `https:${url}` : url.startsWith('/') ? BASE_URL + url : url;
  const match = /^https?:\/\/([^/]*ibyteimg\.com)\/obj\/(.+)$/i.exec(full);
  if (!match || full.includes('~tplv-')) return full;
  return `https://${match[1]!.replace('-ad-', '-lp-')}/${match[2]}~tplv-375lmtcpo0-resize:200:200.webp`;
}

interface Book {
  bookId: number;
  info: { title: string };
  cover?: { imageUrl: string } | null;
}

const summary = (b: Book): MangaSummary => ({
  url: `/books/${b.bookId}`,
  title: b.info.title.trim(),
  thumbnailUrl: thumbnail(b.cover?.imageUrl),
});
const normalize = (url: string) => (url.startsWith('//') ? `https:${url}` : url.startsWith('/') ? BASE_URL + url : url);

/** drm_data: base64 of "#mino-v1|dy-h|…" XOR-ed with a fixed key. */
function stripMap(drm: string): string | undefined {
  const bytes = base64.decodeBytes(drm);
  const plain = utf8.decode(Array.from(bytes, (b, i) => b ^ DRM_KEY.charCodeAt(i % DRM_KEY.length)));
  if (!plain.startsWith(DRM_PREFIX)) return undefined;
  const strips = plain
    .slice(DRM_PREFIX.length)
    .split('|')
    .filter((t) => /^\d+-\d+$/.test(t));
  return strips.length ? strips.join(',') : undefined;
}

export default defineExtension({
  createSource: ({ key }) => {
    const category = ['manga', 'comics', 'hentai'].includes(key) ? key : 'manga';
    async function books(page: number, extra: string[] = []): Promise<MangaPage> {
      const params = ['take=24', `page=${page}`, `category=${category}`, ...extra];
      const result = await api<{ meta: { pageCount: number }; data: { books: Book[] } }>(`/books?${params.join('&')}`);
      return { items: result.data.books.map(summary), hasNextPage: page < result.meta.pageCount };
    }
    return {
      baseUrl: BASE_URL,
      getPopular: (page) => books(page),
      async getFilters(): Promise<Filter[]> {
        const tags = await api<{ data: { tags: { name: string; tagId: number }[] } }>(
          `/books/tags?take=50&category=${category}`,
        )
          .then((r) => r.data.tags)
          .catch(() => []);
        return tags.length
          ? [
              {
                type: 'group',
                id: 'tags',
                label: 'Thể loại',
                filters: tags.map((t): Filter => ({ type: 'checkbox', id: `tag.${t.tagId}`, label: t.name })),
              },
            ]
          : [];
      },
      search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
        const extra: string[] = [];
        if (query) extra.push(`q=${encodeURIComponent(query)}`);
        for (const [id, value] of Object.entries(filters)) {
          if (id.startsWith('tag.') && value === true) extra.push(`includeTags=${id.slice(4)}`);
        }
        return books(page, extra);
      },
      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const { data } = await api<{
          data: {
            book: Book & {
              description?: string | null;
              authors?: { author?: { name?: string | null } | null }[];
              tags?: { name: string }[];
            };
          };
        }>(`/books/${manga.url.split('/').pop()}`);
        const book = data.book;
        return {
          ...summary(book),
          author:
            (book.authors ?? [])
              .map((a) => a.author?.name)
              .filter(Boolean)
              .join(', ') || undefined,
          description: book.description || undefined,
          genres: (book.tags ?? []).map((t) => t.name),
          status: 'unknown',
        };
      },
      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const bookId = manga.url.split('/').pop();
        const { data } = await api<{
          data: {
            chapters: { title?: string | null; chapterId: number; chapterNumber: string; createdAt?: string | null }[];
          };
        }>(`/books/${bookId}/chapters?order=desc`);
        return data.chapters.map((c) => {
          const time = c.createdAt ? Date.parse(c.createdAt) : Number.NaN;
          return {
            url: `/books/${bookId}/${c.chapterId}`,
            name: c.title?.trim() || `Chapter ${c.chapterNumber}`,
            number: Number(c.chapterNumber) || undefined,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          };
        });
      },
      async getPages(chapter: Chapter): Promise<Page[]> {
        const body = (await http.get(`${BASE_URL}/${category}${chapter.url}`, { headers })).body;
        const chapterId = Number(chapter.url.split('/').pop());
        const reader = findRscObject<{
          chapterId: number;
          images: { order: number; servers: { imageUrl: string; drmData?: string | null }[] }[];
        }>(body, (v) => typeof v.chapterId === 'number' && Array.isArray(v.images));
        if (!reader || (chapterId && reader.chapterId !== chapterId)) return [];
        return [...reader.images]
          .sort((a, b) => a.order - b.order)
          .flatMap((image) => {
            // Prefer a server that isn't ibyteimg (those links expire quickly).
            const server = image.servers.find((s) => !/ibyteimg\.com/i.test(normalize(s.imageUrl))) ?? image.servers[0];
            return server ? [server] : [];
          })
          .map((server, index) => {
            const map = server.drmData ? stripMap(server.drmData) : undefined;
            return { index, imageUrl: normalize(server.imageUrl) + (map ? `#mino:${map}` : '') };
          });
      },
      imageHeaders: () => headers,
      transformImage(page: Page, bytes: Uint8Array): ImageTransform {
        const map = /#mino:([\d,-]+)$/.exec(page.imageUrl ?? '')?.[1];
        if (!map) return {};
        const size = imageSize(bytes);
        if (!size) return {};
        const [width, height] = size;
        const ops: TileOp[] = [];
        let sy = 0;
        for (const strip of map.split(',')) {
          const [dy, h] = strip.split('-').map(Number) as [number, number];
          const draw = Math.min(h, height - sy, height - dy);
          if (draw > 0) ops.push({ sx: 0, sy, w: width, h: draw, dx: 0, dy });
          sy += h;
        }
        return { tiles: { width, height, ops } };
      },
      resolveUrl(url: string): MangaSummary | null {
        const match = /^https?:\/\/([^/?#]+)\/(?:b\/)?(?:manga|comics|hentai)\/books\/(\d+)/i.exec(url.trim());
        return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/books/${match[2]}`, title: '' } : null;
      },
      getWebUrl: (item) => `${BASE_URL}/${category}${item.url}`,
    };
  },
});
