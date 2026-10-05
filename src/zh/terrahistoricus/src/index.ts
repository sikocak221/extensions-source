import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://comic.hypergryph.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const TOPIC_KEYS = ['terra-historicus', 'talos-ii-historicus'];
const EPISODE_TYPES = ['', '正篇', '番外', '贺图', '公告'];

interface Episode {
  cid?: string;
  type: number;
  shortTitle?: string | null;
  title: string;
  pageInfos?: { doublePage: boolean }[];
}

interface Comic {
  cid: string;
  type: number;
  cover: string;
  title: string;
  subtitle: string;
  authors: string[];
  keywords?: string[] | null;
  introduction?: string | null;
  episodes?: Episode[];
  updateTime?: number | null;
}

interface RecentUpdate {
  coverUrl: string;
  comicCid: string;
  title: string;
}

async function fetchData<T>(path: string): Promise<T> {
  const response = await http.get<{ data: T }>(`${BASE_URL}${path}`, { headers, responseType: 'json' });
  return response.body.data;
}

function comicSummary(comic: Comic): MangaSummary {
  return { url: `/api/comic/${comic.cid}`, title: comic.title, thumbnailUrl: comic.cover };
}

async function popular(page: number): Promise<MangaPage> {
  const topicKey = TOPIC_KEYS[page - 1];
  if (!topicKey) return { items: [], hasNextPage: false };
  const comics = await fetchData<Comic[]>(`/api/comic?topicKey=${topicKey}`);
  return { items: comics.map(comicSummary), hasNextPage: topicKey !== TOPIC_KEYS[TOPIC_KEYS.length - 1] };
}

const webPath = (url: string) => url.replace(/^\/api/, '');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: popular,
    async getLatest(page): Promise<MangaPage> {
      const topicKey = TOPIC_KEYS[page - 1];
      if (!topicKey) return { items: [], hasNextPage: false };
      const updates = await fetchData<RecentUpdate[]>(`/api/recentUpdate?topicKey=${topicKey}`);
      return {
        items: updates.map((u) => ({ url: `/api/comic/${u.comicCid}`, title: u.title, thumbnailUrl: u.coverUrl })),
        hasNextPage: topicKey !== TOPIC_KEYS[TOPIC_KEYS.length - 1],
      };
    },
    async search(query, page): Promise<MangaPage> {
      const result = await popular(page);
      return { items: result.items.filter((m) => m.title.includes(query)), hasNextPage: result.hasNextPage };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const comic = await fetchData<Comic>(manga.url);
      const description = [comic.subtitle ? `「${comic.subtitle}」\n` : '', comic.introduction ?? ''].join('');
      const type = comic.type === 2 ? ['相簿'] : comic.type === 3 ? ['四格'] : [];
      return {
        ...comicSummary(comic),
        author: comic.authors.join('、'),
        description: description || undefined,
        genres: [...type, ...(comic.keywords ?? [])].join(', ').replace(/，/g, ', ').split(', ').filter(Boolean),
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const comic = await fetchData<Comic>(manga.url);
      return (comic.episodes ?? []).map((episode, index) => ({
        url: `/api/comic/${comic.cid}/episode/${episode.cid}`,
        name:
          episode.type !== 1
            ? `${EPISODE_TYPES[episode.type] ?? ''} ${episode.title}`
            : episode.shortTitle?.trim()
              ? `${episode.shortTitle} ${episode.title}`
              : episode.title,
        uploadedAt: index === 0 ? (comic.updateTime ?? 0) * 1000 || undefined : undefined,
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const episode = await fetchData<Episode>(chapter.url);
      return (episode.pageInfos ?? []).map((_, index) => ({
        index,
        url: `${BASE_URL}${chapter.url}/page?pageNum=${index + 1}`,
      }));
    },
    async getImageUrl(page: Page): Promise<string> {
      const response = await http.get<{ data: { url: string } }>(page.url ?? '', { headers, responseType: 'json' });
      return response.body.data.url;
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${webPath(item.url)}`,
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)\/comic\/(\d+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase() !== hostOf(BASE_URL)) return null;
      return { url: `/api/comic/${match[2]}`, title: '' };
    },
  }),
});
