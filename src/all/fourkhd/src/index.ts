import { type Chapter, type MangaPage, type MangaSummary, type Page, defineExtension } from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities, htmlToText, withQuery } from './common/utils';

const BASE_URL = 'https://www.4khd.com';
const API_URL = `${BASE_URL}/index.php`;
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const PAGE_SIZE = 20;
const IMAGE_URL_REGEX = /\.(?:jpe?g|png|webp|gif|avif)(?:$|\?)/i;

interface Post {
  id: number;
  date: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  jetpack_featured_media_url?: string | null;
  _embedded?: { 'wp:featuredmedia'?: { source_url: string }[]; 'wp:term'?: { name: string }[][] };
}

// Tachiyomi maps the Jetpack proxy (i0.wp.com/pic.4khd.com/...) onto the site's own image hosts, but those now redirect
// to an html page; the proxy still serves the images.
function normalizeImageUrl(url: string, _forThumbnail: boolean): string {
  return url.replace(/\\\//g, '/').replace(/&amp;/g, '&').trim();
}

function imageUrlsFromHtml(content: string): string[] {
  if (!content.trim()) return [];
  const doc = html.load(content, { baseUrl: BASE_URL });
  const root = doc.selectFirst('.entry-content') ?? doc;
  const fromImages = root
    .select('img[data-src], img[data-lazy-src], img[src]')
    .map((img) =>
      [img.absUrl('data-src'), img.absUrl('data-lazy-src'), img.absUrl('src')]
        .map((u) => (u ?? '').trim())
        .find((u) => IMAGE_URL_REGEX.test(u)),
    )
    .filter((u): u is string => !!u)
    .map((u) => normalizeImageUrl(u, false));
  const sources = fromImages.length
    ? fromImages
    : root
        .select('a[href]')
        .map((a) => (a.absUrl('href') ?? '').trim())
        .filter((u) => IMAGE_URL_REGEX.test(u))
        .map((u) => normalizeImageUrl(u, false));
  const seen = new Set<string>();
  return sources.filter((u) => {
    const key = u.replace(/\?.*$/, '');
    if (!u || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function linkPath(link: string): string {
  const path = link.replace(/^https?:\/\/[^/?#]+/i, '').replace(/#.*$/, '');
  return path.startsWith('/') ? path : `/${path}`;
}

function thumbnailOf(post: Post): string | undefined {
  const direct = post.jetpack_featured_media_url || post._embedded?.['wp:featuredmedia']?.[0]?.source_url;
  return direct ? normalizeImageUrl(direct, true) : imageUrlsFromHtml(post.content.rendered)[0];
}

function toManga(post: Post): MangaSummary {
  const title = htmlToText(post.title.rendered);
  return {
    url: `${linkPath(post.link)}?post_id=${post.id}`,
    title: title || decodeEntities(post.title.rendered),
    thumbnailUrl: thumbnailOf(post),
  };
}

async function listPosts(params: Record<string, string>, page: number): Promise<MangaPage> {
  const url = withQuery(API_URL, {
    rest_route: '/wp/v2/posts',
    page: String(page),
    per_page: String(PAGE_SIZE),
    _embed: '1',
    ...params,
  });
  const response = await http.get<Post[]>(url, { headers: HEADERS, responseType: 'json' });
  const key = Object.keys(response.headers).find((k) => k.toLowerCase() === 'x-wp-totalpages');
  const totalPages = Number(key ? response.headers[key] : page) || page;
  const posts = Array.isArray(response.body) ? response.body : [response.body];
  return { items: posts.map(toManga), hasNextPage: page < totalPages };
}

async function getPost(path: string): Promise<Post> {
  const postId = /[?&]post_id=(\d+)/.exec(path)?.[1];
  const cleanPath = path.replace(/\?.*$/, '');
  const slug =
    /\/([^/]+)\.html(?:\/\d+)?\/?$/.exec(cleanPath)?.[1] ??
    cleanPath
      .replace(/\/$/, '')
      .split('/')
      .pop()
      ?.replace(/\.html.*$/, '') ??
    '';
  const params: Record<string, string | undefined> = {
    rest_route: postId ? `/wp/v2/posts/${postId}` : '/wp/v2/posts',
    _embed: '1',
  };
  if (!postId && slug) params.slug = slug;
  const response = await http.get<Post | Post[]>(withQuery(API_URL, params), {
    headers: HEADERS,
    responseType: 'json',
  });
  const post = Array.isArray(response.body) ? response.body[0] : response.body;
  if (!post) throw new Error('Missing post details from API');
  return post;
}

function webUrl(path: string): string {
  const postId = /[?&]post_id=(\d+)/.exec(path)?.[1];
  const clean = path.replace(/\?.*$/, '');
  if (/^\/content\//i.test(clean)) return BASE_URL + clean;
  if (postId) return `${BASE_URL}/?p=${postId}`;
  return BASE_URL + clean;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => listPosts({ orderby: 'modified' }, page),
    getLatest: (page) => listPosts({ orderby: 'date' }, page),
    // the site's firewall answers 403 to parentheses in a search
    search: (query, page) =>
      listPosts({ orderby: 'date', ...(query.trim() ? { search: query.replace(/[()]/g, ' ').trim() } : {}) }, page),
    getMangaDetails: async (manga) => {
      const post = await getPost(manga.url);
      const title = htmlToText(post.title.rendered);
      if (!title) throw new Error(`Missing title for post id=${post.id}`);
      const genres = [
        ...new Set(
          (post._embedded?.['wp:term'] ?? [])
            .flat()
            .map((t) => t.name)
            .filter((n) => n.trim()),
        ),
      ];
      return { ...toManga(post), title, genres, status: 'completed' };
    },
    getChapters: async (manga): Promise<Chapter[]> => {
      const post = await getPost(manga.url);
      const time = Date.parse(post.date);
      return [
        {
          url: `${linkPath(post.link)}?post_id=${post.id}`,
          name: 'Gallery',
          number: 1,
          uploadedAt: Number.isNaN(time) ? undefined : time,
        },
      ];
    },
    getPages: async (chapter): Promise<Page[]> => {
      const post = await getPost(chapter.url);
      return imageUrlsFromHtml(post.content.rendered).map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => HEADERS,
    getWebUrl: (item) => webUrl(item.url),
  }),
});
