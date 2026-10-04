import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, decodeEntities, hostOf, htmlToText } from './common/utils';

const BASE_URL = 'https://www.voyce.me';
const GRAPHQL_URL = 'https://graphql.voyce.me/v1/graphql';
const STATIC_URL = 'https://dlkfxmdtxtzpb.cloudfront.net/';
const PER_PAGE = 10;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Accept: '*/*' };

const SERIES_FIELDS = 'id slug thumbnail title';
const WHERE = 'publish: { _eq: 1 }, type: { id: { _in: [2, 4] } }';

const POPULAR_QUERY = `query($limit: Int, $offset: Int) {
  voyce_series(where: { ${WHERE} }, order_by: [{ views_counts: { count: desc_nulls_last } }], limit: $limit, offset: $offset) { ${SERIES_FIELDS} }
}`;

const LATEST_QUERY = `query($limit: Int, $offset: Int) {
  voyce_series(where: { ${WHERE} }, order_by: [{ updated_at: desc }], limit: $limit, offset: $offset) { ${SERIES_FIELDS} }
}`;

const SEARCH_QUERY = `query($searchTerm: String!, $limit: Int, $offset: Int) {
  voyce_series(where: { ${WHERE}, title: { _ilike: $searchTerm } }, order_by: [{ views_counts: { count: desc_nulls_last } }], limit: $limit, offset: $offset) { ${SERIES_FIELDS} }
}`;

const DETAILS_QUERY = `query($slug: String!) {
  voyce_series(where: { ${WHERE}, slug: { _eq: $slug } }, limit: 1) {
    ${SERIES_FIELDS} description status
    author { username }
    genres(order_by: [{ genre: { title: asc } }]) { genre { title } }
    chapters(order_by: [{ created_at: desc }]) { id title created_at }
  }
}`;

const PAGES_QUERY = `query($chapterId: Int!) {
  voyce_chapter_images(where: { chapter_id: { _eq: $chapterId } }, order_by: { sort_order: asc }) { image }
}`;

interface ComicDto {
  id: number;
  slug: string;
  thumbnail?: string | null;
  title: string;
  description?: string | null;
  status?: string | null;
  author?: { username?: string | null } | null;
  genres?: { genre?: { title?: string | null } | null }[] | null;
  chapters?: { id: number; title: string; created_at?: string | null }[] | null;
}

async function graphql<T>(query: string, variables: Record<string, unknown>, referer = `${BASE_URL}/`): Promise<T> {
  const response = await http.post(
    GRAPHQL_URL,
    { json: { query, variables } },
    { headers: { ...headers, Referer: referer } },
  );
  const result = JSON.parse(response.body) as { data?: T; errors?: { message: string }[] };
  if (!result.data) throw new Error(result.errors?.[0]?.message ?? 'GraphQL request failed');
  return result.data;
}

const toSummary = (c: ComicDto): MangaSummary => ({
  url: `/series/${c.slug}`,
  title: c.title,
  thumbnailUrl: c.thumbnail ? STATIC_URL + c.thumbnail : undefined,
});

async function list(query: string, page: number, extra: Record<string, unknown> = {}): Promise<MangaPage> {
  const { voyce_series } = await graphql<{ voyce_series: ComicDto[] }>(query, {
    offset: (page - 1) * PER_PAGE,
    limit: PER_PAGE,
    ...extra,
  });
  const items = voyce_series.map(toSummary);
  return { items, hasNextPage: items.length === PER_PAGE };
}

const slugOf = (url: string) => url.split('/')[2] ?? '';

async function comic(manga: MangaSummary): Promise<ComicDto> {
  const { voyce_series } = await graphql<{ voyce_series: ComicDto[] }>(
    DETAILS_QUERY,
    { slug: slugOf(manga.url) },
    BASE_URL + manga.url,
  );
  const found = voyce_series[0];
  if (!found) throw new Error('Series not found');
  return found;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(POPULAR_QUERY, page),
    getLatest: (page) => list(LATEST_QUERY, page),
    search: (query, page) => list(SEARCH_QUERY, page, { searchTerm: `%${query.trim()}%` }),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const c = await comic(manga);
      return {
        ...toSummary(c),
        author: c.author?.username || undefined,
        description: c.description ? htmlToText(decodeEntities(c.description)) : undefined,
        status: c.status === 'completed' ? 'completed' : c.status === 'ongoing' ? 'ongoing' : 'unknown',
        genres: (c.genres ?? []).flatMap((g) => (g.genre?.title ? [g.genre.title] : [])),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const c = await comic(manga);
      const seen = new Set<string>();
      return (c.chapters ?? [])
        .filter((ch) => !seen.has(ch.title) && seen.add(ch.title))
        .map((ch) => {
          const date = ch.created_at ? Date.parse(ch.created_at.slice(0, 10)) : NaN;
          return {
            url: `/series/${c.slug}/${ch.id}`,
            name: ch.title,
            uploadedAt: Number.isNaN(date) ? undefined : date,
          };
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const chapterId = Number(chapter.url.split('/').pop()?.split('#')[0]);
      const { voyce_chapter_images } = await graphql<{ voyce_chapter_images: { image: string }[] }>(PAGES_QUERY, {
        chapterId,
      });
      return voyce_chapter_images.map((p, index) => ({ index, imageUrl: STATIC_URL + p.image }));
    },
    imageHeaders: () => ({ ...headers, Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL).replace(/^www\./, '')
        ? { url: `/series/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
