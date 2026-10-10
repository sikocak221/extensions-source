import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type SourceInfo,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, withQuery } from './common/utils';

const SITE = 'https://www.tappytoon.com';
const API_URL = 'https://api-global.tappytoon.com';

const GENRES: [string, string][] = [
  ['<select>', ''], ['Action', 'action'], ['Romance', 'romance'], ['Fantasy', 'fantasy'], ['School', 'school'],
  ['Slice of Life', 'slice'], ['BL', 'bl'], ['Comedy', 'comedy'], ['GL', 'gl'],
]; // prettier-ignore

interface Named {
  name: string;
}
interface Comic {
  id: number;
  title: string;
  slug: string;
  longDescription: string;
  posterThumbnailUrl: string;
  isHiatus: boolean;
  isAccessible: boolean;
  isCompleted: boolean;
  ageRating: Named;
  genres: Named[];
  authors: Named[];
}
interface ChapterDto {
  id: number;
  order: number;
  title: string;
  subtitle: string;
  isAccessible: boolean;
  isFree: boolean;
  isUserUnlocked: boolean;
  isUserRented: boolean;
  willAccessibleAt: string;
}

export default defineExtension({
  createSource: (info: SourceInfo) => {
    const lang = info.lang;
    const baseUrl = `${SITE}/${lang}`;
    const baseHeaders: Record<string, string> = { 'User-Agent': USER_AGENT, Referer: `${SITE}/`, Origin: SITE };
    let apiHeadersCache: Record<string, string> | undefined;
    let nextUrl: string | undefined;

    async function apiHeaders(): Promise<Record<string, string>> {
      if (apiHeadersCache) return apiHeadersCache;
      const response = await http.get(baseUrl, { headers: baseHeaders });
      const data = html.load(response.body).selectFirst('#__NEXT_DATA__')?.html();
      if (!data) throw new Error('Could not read the site session');
      const axios = (JSON.parse(data) as { props: { initialState: { axios: { headers: Record<string, string> } } } })
        .props.initialState.axios.headers;
      return (apiHeadersCache = {
        ...baseHeaders,
        'Accept-Language': lang,
        Authorization: axios.Authorization!,
        'X-Device-Uuid': axios['X-Device-Uuid']!,
      });
    }

    async function request<T>(url: string): Promise<{ body: T; headers: Record<string, string> }> {
      const response = await http.request<T>({ url, headers: await apiHeaders(), responseType: 'json' });
      if (response.status < 200 || response.status >= 300) {
        const message = (response.body as { message?: string } | null)?.message;
        throw new Error(message ?? `HTTP error ${response.status}`);
      }
      return { body: response.body, headers: response.headers };
    }

    const toManga = (c: Comic): MangaSummary => ({
      url: `/${c.slug}|${c.id}`,
      title: c.title,
      thumbnailUrl: c.posterThumbnailUrl,
    });

    const comics = (list: Comic[], hasNextPage = false): MangaPage => ({
      items: list.filter((c) => c.isAccessible).map(toManga),
      hasNextPage,
    });

    return {
      baseUrl,

      async getPopular(): Promise<MangaPage> {
        const url = withQuery(`${API_URL}/comics`, { sort_by: 'trending', filter: 'completed', locale: lang });
        return comics((await request<Comic[]>(url)).body);
      },

      async getLatest(): Promise<MangaPage> {
        const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getUTCDay()]!;
        const url = withQuery(`${API_URL}/comics`, { day_of_week: day, locale: lang });
        return comics((await request<Comic[]>(url)).body);
      },

      getFilters(): Filter[] {
        return [
          { type: 'header', label: "NOTE: can't be used with text search!" },
          { type: 'select', id: 'genre', label: 'Genre', options: GENRES.map(([label, value]) => ({ label, value })) },
        ];
      },

      async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
        let url = page > 1 ? nextUrl : undefined;
        if (!url) {
          const params: Record<string, string> = { locale: lang };
          const genre = typeof state.genre === 'string' ? state.genre : '';
          if (genre) {
            params.genre = genre;
            params.limit = '50';
          } else if (query.trim()) params.keyword = query;
          url = withQuery(`${API_URL}/comics`, params);
        }
        const response = await request<Comic[]>(url);
        const link = Object.entries(response.headers).find(([k]) => k.toLowerCase() === 'link')?.[1];
        nextUrl = link?.split('<')[1]?.split('>')[0];
        return comics(response.body, link != null);
      },

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const id = manga.url.split('|')[1];
        const comic = (
          await request<Comic[]>(withQuery(`${API_URL}/comics`, { locale: lang, keyword: manga.title }))
        ).body.find((c) => String(c.id) === id);
        if (!comic) return { url: manga.url, title: manga.title, thumbnailUrl: manga.thumbnailUrl, status: 'unknown' };
        const authors = comic.authors.map((a) => a.name).join(', ');
        const status: MangaStatus = comic.isCompleted ? 'completed' : comic.isHiatus ? 'unknown' : 'ongoing';
        return {
          url: manga.url,
          title: comic.title,
          description: comic.longDescription,
          thumbnailUrl: comic.posterThumbnailUrl,
          author: authors,
          artist: authors,
          genres: [...comic.genres.map((g) => g.name), `Rating: ${comic.ageRating.name}`],
          status,
        };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const id = manga.url.split('|')[1];
        const list = (await request<ChapterDto[]>(withQuery(`${API_URL}/comics/${id}/chapters`, { locale: lang })))
          .body;
        return list
          .filter((c) => c.isAccessible)
          .reverse()
          .map((c) => ({
            url: String(c.id),
            name: `${c.title}${c.subtitle ? ` - ${c.subtitle}` : ''}${!c.isFree && !(c.isUserUnlocked || c.isUserRented) ? ' 🔒' : ''}`,
            number: c.order + 1,
            uploadedAt: Date.parse(c.willAccessibleAt) || undefined,
          }));
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const url = withQuery(`${API_URL}/content-delivery/contents`, {
          chapterId: chapter.url,
          variant: 'high',
          locale: lang,
        });
        const media = (await request<{ media: { path: string }[] }>(url)).body.media;
        return media.map((m, index) => ({ index, imageUrl: m.path }));
      },

      imageHeaders: () => baseHeaders,

      // No resolveUrl: a web link only has the slug, the api needs the comic id.

      getWebUrl: (item: MangaSummary | Chapter) => ('title' in item ? `${baseUrl}/comics${item.url.split('|')[0]}` : baseUrl),
    };
  },
});
