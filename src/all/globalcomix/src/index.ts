import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate, withQuery } from './common/utils';

const WEB_URL = 'https://globalcomix.com';
const API_URL = 'https://api.globalcomix.com/v1';
const API_MANGA_URL = `${API_URL}/read`;
const API_CHAPTER_URL = `${API_URL}/readV2`;
const API_SEARCH_URL = `${API_URL}/comics`;
const CLIENT_ID = 'gck_d0f170d5729446dcb3b55e6b3ebc7bf6';
const DATA_SAVER_KEY = 'dataSaver';
const SHOW_LOCKED_KEY = 'showLockedChapters';
const LOCK_SYMBOL = '🔒';
const HEADERS = { 'User-Agent': USER_AGENT, 'x-gc-client': CLIENT_ID, 'x-gc-identmode': 'cookie' };

// the site's own lang codes for these differ from the app's lang codes
const SITE_LANG: Record<string, string> = {
  sq: 'al',
  'pt-BR': 'br',
  'zh-Hans': 'cn',
  cs: 'cz',
  da: 'dk',
  fil: 'fo',
  he: 'iw',
  ja: 'jp',
  ko: 'kr',
  ms: 'my',
  sv: 'se',
  uk: 'ua',
  'zh-Hant': 'zh',
};

interface Payload<T> {
  payload?: { results: T };
}
interface Paginated<T> {
  payload?: { results: T[]; pagination: { page: number; total_pages: number } };
}
interface ComicDto {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  status_name?: string | null;
  category_name?: string | null;
  image_url?: string | null;
  artist: { name: string; roman_name?: string | null };
}
interface ReleaseDto {
  id: number;
  title: string;
  chapter: string;
  key: string;
  premium_only?: number | null;
  published_time: string;
  page_objects?: { desktop_image_url: string; mobile_image_url: string }[] | null;
}

const STATUS: Record<string, MangaStatus> = {
  Ongoing: 'ongoing',
  Preview: 'ongoing',
  Finished: 'completed',
  'On hold': 'hiatus',
  Cancelled: 'cancelled',
};

const comicId = (url: string): string => url.split('/').filter(Boolean)[0] ?? '';
const comicSlug = (url: string): string => url.split('/').filter(Boolean)[1] ?? '';

function toDetails(dto: ComicDto): MangaDetails {
  return {
    url: `/${dto.id}/${dto.slug}`,
    title: dto.name,
    thumbnailUrl: dto.image_url ?? undefined,
    description: dto.description ?? undefined,
    author: dto.artist.roman_name ?? dto.artist.name,
    status: (dto.status_name && STATUS[dto.status_name]) || 'unknown',
    genres: dto.category_name ? [dto.category_name] : undefined,
  };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await http.get<T>(url, { headers: HEADERS, responseType: 'json' });
  return response.body;
}

export default defineExtension({
  preferences: (): Preference[] => [
    { type: 'switch', key: DATA_SAVER_KEY, label: 'Data saver', description: 'Use smaller images', default: false },
    {
      type: 'switch',
      key: SHOW_LOCKED_KEY,
      label: 'Show locked chapters',
      description: 'Show premium chapters that cannot be read without a subscription',
      default: true,
    },
  ],
  createSource: ({ lang }) => {
    const extLang = SITE_LANG[lang] ?? lang;

    async function simpleQuery(page: number, orderBy?: string, query?: string): Promise<MangaPage> {
      const url = withQuery(API_SEARCH_URL, { 'lang_id[]': extLang, p: String(page), sort: orderBy, q: query });
      const payload = (await getJson<Paginated<ComicDto>>(url)).payload;
      if (!payload) return { items: [], hasNextPage: false };
      return {
        items: payload.results.map((dto) => {
          const details = toDetails(dto);
          return { url: details.url, title: details.title, thumbnailUrl: details.thumbnailUrl };
        }),
        hasNextPage: payload.pagination.page < payload.pagination.total_pages,
      };
    }

    async function fetchBySlug(slug: string): Promise<MangaDetails> {
      const payload = (await getJson<Payload<ComicDto>>(`${API_MANGA_URL}/${slug}`)).payload;
      if (!payload) throw new Error('Comic not found');
      return toDetails(payload.results);
    }

    return {
      baseUrl: WEB_URL,
      getPopular: (page) => simpleQuery(page),
      getLatest: (page) => simpleQuery(page, 'recent'),
      search: (query, page) => simpleQuery(page, 'relevance', query),
      getMangaDetails: (manga) => fetchBySlug(comicSlug(manga.url) || comicId(manga.url)),
      getChapters: async (manga): Promise<Chapter[]> => {
        const url = withQuery(`${API_SEARCH_URL}/${comicId(manga.url)}/releases`, {
          lang_id: extLang,
          all: 'true',
        });
        const payload = (await getJson<Paginated<ReleaseDto>>(url)).payload;
        const showLocked = prefs.get<boolean>(SHOW_LOCKED_KEY) ?? true;
        return (payload?.results ?? [])
          .filter((dto) => !(dto.premium_only === 1 && !showLocked))
          .map((dto): Chapter => {
            const parts: string[] = [];
            if (dto.premium_only === 1) parts.push(LOCK_SYMBOL);
            if (dto.chapter) parts.push(`Ch.${dto.chapter}`);
            if (dto.title) {
              if (parts.length) parts.push('-');
              parts.push(dto.title);
            }
            const number = Number.parseFloat(dto.chapter);
            return {
              url: dto.key,
              name: parts.join(' ') || dto.key,
              number: Number.isNaN(number) ? 0 : number,
              uploadedAt: parseDate(dto.published_time, 'yyyy-MM-dd HH:mm:ss'),
            };
          });
      },
      getPages: async (chapter): Promise<Page[]> => {
        const payload = (await getJson<Payload<ReleaseDto>>(`${API_CHAPTER_URL}/${chapter.url}`)).payload;
        const dataSaver = prefs.get<boolean>(DATA_SAVER_KEY) ?? false;
        return (payload?.results.page_objects ?? []).map((dto, index) => ({
          index,
          imageUrl: dataSaver ? dto.mobile_image_url : dto.desktop_image_url,
        }));
      },
      imageHeaders: () => HEADERS,
      getWebUrl: (item) => ('name' in item ? `${WEB_URL}/read/${item.url}` : `${WEB_URL}/c/${comicSlug(item.url)}`),
    };
  },
});
