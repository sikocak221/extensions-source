import {
  type Chapter,
  type HtmlElement,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://jjcos.com';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const PAGE_SIZE = 20;

interface Post {
  title: string;
  link: string;
  feature?: string | null;
  content?: string | null;
}

async function fetchDocument(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(url, { headers: HEADERS });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

function linkToPath(link: string): string {
  const sanitized = link.trim().split('?')[0]!.split('#')[0]!.replace(/ /g, '%20');
  return relativeUrl(sanitized);
}

async function fetchPosts(page: number, query?: string): Promise<Post[]> {
  const url = withQuery(`${BASE_URL}/api/index.html`, { page: String(page), query: query?.trim() || undefined });
  const response = await http.get<{ posts: Post[] }>(url, { headers: HEADERS, responseType: 'json' });
  return response.body.posts;
}

function toMangasPage(posts: Post[], page: number): MangaPage {
  const start = (Math.max(page, 1) - 1) * PAGE_SIZE;
  if (start >= posts.length) return { items: [], hasNextPage: false };
  const end = Math.min(posts.length, start + PAGE_SIZE);
  const items = posts.slice(start, end).map((post): MangaSummary => {
    const title = post.title.trim();
    if (!title) throw new Error(`Missing title in ${post.link}`);
    return { url: linkToPath(post.link), title, thumbnailUrl: post.feature ?? undefined };
  });
  return { items, hasNextPage: end < posts.length };
}

const parseDateTime = (raw: string | undefined | null): number | undefined =>
  parseDate(raw, 'yyyy-MM-dd HH:mm:ss') ?? parseDate(raw, 'yyyy-MM-dd');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => toMangasPage(await fetchPosts(page), page),
    search: async (query, page) => {
      const posts = await fetchPosts(page, query);
      const q = query.trim().toLowerCase();
      const filtered = q
        ? posts.filter((post) => post.title.toLowerCase().includes(q) || (post.content ?? '').toLowerCase().includes(q))
        : posts;
      return toMangasPage(filtered, page);
    },
    getMangaDetails: async (manga) => {
      const { document, url } = await fetchDocument(BASE_URL + manga.url);
      const title = document
        .selectFirst('h1.fh5co-article-title')
        ?.text()
        .replace(/ - JJCOS$/, '')
        .trim();
      if (!title) throw new Error('Title not found');
      const tags = [
        ...new Set(
          document
            .select('.tag-container a.tag')
            .map((a) => a.text().replace(/^#/, '').trim())
            .filter(Boolean),
        ),
      ];
      return {
        url: manga.url,
        title,
        thumbnailUrl: document.selectFirst('#post-content img, article img')?.absUrl('src'),
        genres: tags,
        status: 'completed',
      };
    },
    getChapters: async (manga): Promise<Chapter[]> => {
      const { document, url } = await fetchDocument(BASE_URL + manga.url);
      const raw =
        document.selectFirst('meta[property="article:published_time"]')?.attr('content') ||
        document.selectFirst('.breadcrumb-item.date-overlay')?.text();
      return [{ url: relativeUrl(url), name: 'Gallery', uploadedAt: parseDateTime(raw) }];
    },
    getPages: async (chapter): Promise<Page[]> => {
      const { document } = await fetchDocument(BASE_URL + chapter.url);
      const urls = new Set<string>();
      for (const img of document.select('#post-content img, article #post-content img, article p img')) {
        const url = (img.absUrl('src') || img.absUrl('data-src') || '').trim();
        if (url) urls.add(url);
      }
      return [...urls].map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => HEADERS,
    resolveUrl: (url) => {
      const host = hostOf(url).replace(/^www\./, '');
      if (host !== hostOf(BASE_URL) || !/^\/post\//.test(relativeUrl(url))) return null;
      return { url: relativeUrl(url), title: '' };
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
