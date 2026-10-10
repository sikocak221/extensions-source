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
import { USER_AGENT, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://taddy.org';
const LIMIT = 25;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES: [string, string][] = [
  ['', ''], ['Action', 'COMICSERIES_ACTION'], ['Comedy', 'COMICSERIES_COMEDY'], ['Drama', 'COMICSERIES_DRAMA'],
  ['Educational', 'COMICSERIES_EDUCATIONAL'], ['Fantasy', 'COMICSERIES_FANTASY'], ['Historical', 'COMICSERIES_HISTORICAL'],
  ['Horror', 'COMICSERIES_HORROR'], ['Inspirational', 'COMICSERIES_INSPIRATIONAL'], ['Mystery', 'COMICSERIES_MYSTERY'],
  ['Romance', 'COMICSERIES_ROMANCE'], ['Sci-Fi', 'COMICSERIES_SCI_FI'], ['Slice Of Life', 'COMICSERIES_SLICE_OF_LIFE'],
  ['Superhero', 'COMICSERIES_SUPERHERO'], ['Supernatural', 'COMICSERIES_SUPERNATURAL'],
  ['Wholesome', 'COMICSERIES_WHOLESOME'], ['BL (Boy Love)', 'COMICSERIES_BL'], ['GL (Girl Love)', 'COMICSERIES_GL'],
  ['LGBTQ+', 'COMICSERIES_LGBTQ'], ['Thriller', 'COMICSERIES_THRILLER'], ['Zombies', 'COMICSERIES_ZOMBIES'],
  ['Post Apocalyptic', 'COMICSERIES_POST_APOCALYPTIC'], ['School', 'COMICSERIES_SCHOOL'], ['Sports', 'COMICSERIES_SPORTS'],
  ['Animals', 'COMICSERIES_ANIMALS'], ['Gaming', 'COMICSERIES_GAMING'],
]; // prettier-ignore
const genreNames = new Map(GENRES.map(([name, id]) => [id, name]));

interface Comic {
  name?: string;
  url: string;
  description?: string | null;
  genres?: string[];
  creators?: { name?: string }[];
  coverImage?: { base_url?: string | null; cover_sm?: string | null } | null;
  issues?: {
    identifier: string;
    name: string;
    datePublished: string;
    stories?: { storyImage?: { base_url?: string | null; story?: string | null } | null }[];
  }[];
}

const getJson = async <T>(url: string): Promise<T> => (await http.get<T>(url, { headers, responseType: 'json' })).body;

const thumbnail = (c: Comic) =>
  c.coverImage?.base_url && c.coverImage.cover_sm ? `${c.coverImage.base_url}${c.coverImage.cover_sm}` : undefined;

function toPage(results: { comicseries?: Comic[] }): MangaPage {
  const list = results.comicseries ?? [];
  return {
    items: list.map((c) => ({ url: relativeUrl(c.url), title: c.name ?? 'Unknown', thumbnailUrl: thumbnail(c) })),
    hasNextPage: list.length === LIMIT,
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    async getPopular(page: number): Promise<MangaPage> {
      return toPage(
        await getJson(
          withQuery(`${BASE_URL}/feeds/directory/list`, {
            lang: '',
            taddyType: 'comicseries',
            ua: 'tc',
            page: String(page),
            limit: String(LIMIT),
          }),
        ),
      );
    },

    getFilters(): Filter[] {
      return [
        {
          type: 'select',
          id: 'genre',
          label: 'Filter By Genre',
          options: GENRES.map(([label, value]) => ({ label, value })),
        },
        { type: 'separator' },
        { type: 'header', label: 'Filter by the creator or tags:' },
        { type: 'text', id: 'creator', label: 'Creator' },
        { type: 'text', id: 'tags', label: 'Tags' },
      ];
    },

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const params: Record<string, string> = {
        q: query,
        lang: '',
        taddyType: 'comicseries',
        ua: 'tc',
        page: String(page),
        limit: String(LIMIT),
      };
      if (typeof state.genre === 'string' && state.genre) params.genre = state.genre;
      if (typeof state.creator === 'string' && state.creator.trim()) params.creator = state.creator;
      if (typeof state.tags === 'string' && state.tags.trim()) params.tags = state.tags;
      return toPage(await getJson(withQuery(`${BASE_URL}/feeds/directory/search`, params)));
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const comic = await getJson<Comic>(`${BASE_URL}${manga.url}`);
      return {
        url: manga.url,
        title: comic.name ?? manga.title,
        thumbnailUrl: thumbnail(comic) ?? manga.thumbnailUrl,
        author:
          (comic.creators ?? [])
            .map((c) => c.name)
            .filter(Boolean)
            .join(', ') || undefined,
        description: comic.description ?? undefined,
        genres: (comic.genres ?? []).flatMap((g) => genreNames.get(g) ?? []),
        status: 'ongoing',
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const comic = await getJson<Comic>(`${BASE_URL}${manga.url}`);
      const issues = comic.issues ?? [];
      return issues
        .map((issue, i) => ({
          url: `${manga.url}#${issue.identifier}`,
          name: issue.name,
          number: issues.length - i,
          uploadedAt: Date.parse(issue.datePublished) || undefined,
        }))
        .reverse();
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const [path, uuid] = chapter.url.split('#') as [string, string];
      const comic = await getJson<Comic>(`${BASE_URL}${path}`);
      const issue = (comic.issues ?? []).find((i) => i.identifier === uuid);
      return (issue?.stories ?? []).map((s, index) => ({
        index,
        imageUrl: `${s.storyImage?.base_url ?? ''}${s.storyImage?.story ?? ''}`,
      }));
    },

    imageHeaders: () => headers,

    getWebUrl: (item) => `${BASE_URL}${item.url.split('#')[0]}`,
  }),
});
