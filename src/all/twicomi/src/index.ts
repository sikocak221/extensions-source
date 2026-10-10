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
import { USER_AGENT, parseDate, withQuery } from './common/utils';

const BASE_URL = 'https://twicomi.com';
const API_URL = 'https://api.twicomi.com/api/v2';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Origin: BASE_URL };

interface AuthorDto {
  screen_name: string;
  name: string;
  description?: string | null;
  profile_image?: string | null;
}
interface TweetDto {
  tweet_id: string;
  tweet_text: string;
  attach_image_urls: string[];
  tags: string[];
  hash_tags: string[];
  tweet_create_time: string;
}
interface MangaListItem {
  author: AuthorDto;
  tweet: TweetDto;
}

const getJson = async <T>(url: string): Promise<T> =>
  (await http.get<{ response: T }>(url, { headers, responseType: 'json' })).body.response;

/** Tweet times are Asia/Tokyo. */
const tokyo = (text: string) => (parseDate(text, 'yyyy-MM-dd HH:mm:ss') ?? 0) - 9 * 3_600_000;

const firstLine = (text: string) => text.split('\n').find((line) => line.trim())?.trim() ?? '';

function tweetToManga(item: MangaListItem): MangaDetails {
  const { author, tweet } = item;
  const extra = `${tokyo(tweet.tweet_create_time)},${tweet.attach_image_urls.join(',')}`;
  return {
    url: `/manga/${author.screen_name}/${tweet.tweet_id}#${extra}`,
    title: firstLine(tweet.tweet_text) || `Tweet ${tweet.tweet_id}`,
    author: `${author.name} (@${author.screen_name})`,
    description: tweet.tweet_text,
    genres: [...tweet.hash_tags, ...tweet.tags],
    status: 'completed',
    thumbnailUrl: tweet.attach_image_urls[0],
  };
}

const authorToManga = (a: AuthorDto): MangaDetails => ({
  url: `/author/${a.screen_name}`,
  title: a.name,
  author: a.screen_name,
  description: a.description ?? undefined,
  thumbnailUrl: a.profile_image ?? undefined,
  status: 'unknown',
});

async function mangaList(url: string, page: number, limit: number): Promise<MangaPage> {
  const data = await getJson<{ total_count: number; manga_list: MangaListItem[] }>(url);
  return { items: data.manga_list.map(tweetToManga), hasNextPage: page * limit < data.total_count };
}

const dummyChapter = (manga: MangaSummary): Chapter => ({
  url: manga.url,
  name: 'Tweet',
  uploadedAt: Number(manga.url.split('#')[1]?.split(',')[0]) || undefined,
});

const sortFilter = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'sort',
  id,
  label,
  options: options.map(([l, value]) => ({ label: l, value })),
  default: { value: options[0]![1], ascending: false },
});

function addSort(params: Record<string, string>, state: FilterState, id: string) {
  const sort = state[id];
  if (sort && typeof sort === 'object') {
    params.order_by = sort.value;
    params.order = sort.ascending ? 'asc' : 'desc';
  }
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page: number) => mangaList(`${API_URL}/manga/featured/list?page_no=${page}&page_limit=24`, page, 24),

    getLatest: (page: number) =>
      mangaList(`${API_URL}/manga/list?order_by=create_time&page_no=${page}&page_limit=24`, page, 24),

    getFilters(): Filter[] {
      return [
        {
          type: 'select',
          id: 'type',
          label: 'Search for',
          options: [
            { label: 'Tweet', value: 'tweet' },
            { label: 'Author', value: 'author' },
          ],
        },
        sortFilter('mangaSort', 'Sort (Tweet)', [
          ['Date', 'create_time'],
          ['Retweets', 'retweet_count'],
          ['Likes', 'good_count'],
        ]),
        sortFilter('authorSort', 'Sort (Author)', [
          ['Followers', 'follower_count'],
          ['Tweets', 'manga_tweet_count'],
          ['Recently tweeted', 'latest_manga_tweet_time'],
        ]),
      ];
    },

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const authors = state.type === 'author';
      const params: Record<string, string> = {};
      addSort(params, state, authors ? 'authorSort' : 'mangaSort');
      if (query.trim()) params.query = query;
      params.page_no = String(page);
      params.page_limit = '12';
      const url = withQuery(`${API_URL}/${authors ? 'author' : 'manga'}/list`, params);
      if (!authors) return mangaList(url, page, 12);
      const data = await getJson<{ total_count: number; author_list: { author: AuthorDto }[] }>(url);
      return { items: data.author_list.map((a) => authorToManga(a.author)), hasNextPage: page * 12 < data.total_count };
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return { ...manga, status: manga.url.startsWith('/manga/') ? 'completed' : 'unknown' };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      if (manga.url.startsWith('/manga/')) return [dummyChapter(manga)];
      const screenName = manga.url.split('/')[2]!;
      const results: MangaListItem[] = [];
      const limit = 500;
      for (let page = 1, total = Number.POSITIVE_INFINITY; (page - 1) * limit < total; page++) {
        const data = await getJson<{ total_count: number; manga_list: MangaListItem[] }>(
          `${API_URL}/author/manga/list?screen_name=${screenName}&order_by=create_time&order=asc&page_no=${page}&page_limit=${limit}`,
        );
        results.push(...data.manga_list);
        total = data.total_count;
        await timers.sleep(0);
      }
      return results
        .map((item, i) => ({
          ...dummyChapter(tweetToManga(item)),
          name: firstLine(item.tweet.tweet_text),
          number: i + 1,
        }))
        .reverse();
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const urls = (chapter.url.split('#')[1] ?? '').split(',').slice(1).filter(Boolean);
      return urls.map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => headers,

    getWebUrl(item: MangaSummary | Chapter): string {
      const path = item.url.split('#')[0]!;
      return `${BASE_URL}${path}${'title' in item && path.startsWith('/author/') ? '/page/1' : ''}`;
    },
  }),
});
