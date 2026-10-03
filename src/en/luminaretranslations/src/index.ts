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
import { USER_AGENT, hostOf, withQuery } from './common/utils';

const BASE_URL = 'https://luminaretranslations.com';
const API = `${BASE_URL}/wp-json/yarnovel/v1`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const PAGE_SIZE = 24;
const NOVELS = ['novel', 'light_novel', 'web_novel'];

interface Option {
  name?: string;
  label?: string;
  slug?: string;
  value?: string;
}
const opt = (o: Option) => ({ label: o.name ?? o.label ?? '', value: o.slug ?? o.value ?? '' });

async function list(page: number, query: string, filters: FilterState): Promise<MangaPage> {
  const text = (id: string) => (typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : undefined);
  const group = (prefix: string) =>
    Object.entries(filters)
      .filter(([id, v]) => id.startsWith(`${prefix}.`) && v === true)
      .map(([id]) => id.slice(prefix.length + 1))
      .join(',') || undefined;
  const url = withQuery(`${API}/series`, {
    page: String(page),
    per_page: String(PAGE_SIZE),
    type: 'manga',
    search: query.trim() || undefined,
    sort: text('sort'),
    genres: group('genre'),
    tags: group('tag'),
    author: text('author'),
    artist: text('artist'),
    status: text('status'),
  });
  const data = (
    await http.get<{
      data: { title: string; slug: string; type?: string | null; cover_image?: string | null }[];
      meta: { total: number };
    }>(url, { headers, responseType: 'json' })
  ).body;
  return {
    items: data.data
      .filter((e) => !NOVELS.includes(e.type ?? ''))
      .map((e) => ({ url: `/series/${e.slug}`, title: e.title, thumbnailUrl: e.cover_image || undefined })),
    hasNextPage: page * PAGE_SIZE < data.meta.total,
  };
}

// The series page keeps its info rows and chapters in an Alpine "x-data" object, one "key: value," per line.
async function seriesPage(url: string) {
  const response = await http.get(`${BASE_URL}${url}`, { headers });
  const document = html.load(response.body, { baseUrl: response.url });
  const xData = (document.selectFirst('section[x-data*="chapters:"]')?.attr('x-data') ?? '')
    .split('\n')
    .map((l) => l.trim());
  const value = <T>(key: string): T =>
    JSON.parse(
      xData
        .find((l) => l.startsWith(`${key}:`))
        ?.slice(key.length + 1)
        .trim()
        .replace(/,$/, '') ?? 'null',
    ) as T;
  return { document, value };
}

const slugOf = (url: string) => url.split('/')[2] ?? '';

// Manga urls are "/series/<slug>", chapter urls "/series/<slug>/<chapter id>".
export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(page, '', { sort: 'popular' }),
    getLatest: (page) => list(page, '', { sort: 'latest' }),
    search: (query, page, filters) => list(page, query, filters),
    async getFilters(): Promise<Filter[]> {
      try {
        const f = (
          await http.get<Record<string, Option[]>>(`${API}/explore/filters`, { headers, responseType: 'json' })
        ).body;
        const any = { label: 'Any', value: '' };
        return [
          { type: 'header', label: 'Note: Search and active filters are applied together' },
          { type: 'select', id: 'sort', label: 'Sort', options: (f.sorts ?? []).map(opt) },
          { type: 'select', id: 'status', label: 'Status', options: [any, ...(f.statuses ?? []).map(opt)] },
          { type: 'separator' },
          {
            type: 'group',
            id: 'genre',
            label: 'Genres',
            filters: (f.genres ?? [])
              .map(opt)
              .map((o) => ({ type: 'checkbox', id: `genre.${o.value}`, label: o.label })),
          },
          {
            type: 'group',
            id: 'tag',
            label: 'Tags',
            filters: (f.tags ?? []).map(opt).map((o) => ({ type: 'checkbox', id: `tag.${o.value}`, label: o.label })),
          },
          { type: 'select', id: 'author', label: 'Author', options: [any, ...(f.authors ?? []).map(opt)] },
          { type: 'select', id: 'artist', label: 'Artist', options: [any, ...(f.artists ?? []).map(opt)] },
        ];
      } catch (error) {
        log.warn('Cannot load filters', error);
        return [];
      }
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document, value } = await seriesPage(manga.url);
      const info = Object.fromEntries(
        (value<{ label: string; value: string }[]>('infoRows') ?? []).map((r) => [r.label, r.value]),
      );
      const statuses: Record<string, MangaStatus> = {
        ongoing: 'ongoing',
        completed: 'completed',
        hiatus: 'hiatus',
        dropped: 'cancelled',
      };
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('meta[property="og:image"]')?.attr('content') || manga.thumbnailUrl,
        description: document.selectFirst('#series-description')?.text().trim() || undefined,
        author: info.Author,
        artist: info.Artist,
        genres: info.Genre?.split(',').map((g) => g.trim()),
        status: statuses[info.Status?.toLowerCase() ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { value } = await seriesPage(manga.url);
      return (
        value<
          {
            id: number;
            number: number;
            title?: string | null;
            subtitle?: string | null;
            published_at?: string | null;
          }[]
        >('chapters') ?? []
      )
        .map((c) => {
          const time = c.published_at ? Date.parse(c.published_at) : Number.NaN;
          return {
            url: `/series/${slugOf(manga.url)}/${c.id}`,
            name: `${c.title?.trim() || `Chapter ${c.number}`}${c.subtitle?.trim() ? ` - ${c.subtitle}` : ''}`,
            number: c.number,
            uploadedAt: Number.isFinite(time) ? time : undefined,
          };
        })
        .sort((a, b) => b.number - a.number);
    },
    // Each image is offered by several servers: keep those of the first one.
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = html.load((await http.get(`${BASE_URL}${chapter.url}`, { headers })).body, {
        baseUrl: BASE_URL,
      });
      const images = document.select('img.reader-page[data-src]');
      const server = images[0]?.attr('data-server-id');
      return images
        .filter((img) => img.attr('data-server-id') === server)
        .map((img, index) => ({ index, imageUrl: img.absUrl('data-src') || img.attr('data-src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/series/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
