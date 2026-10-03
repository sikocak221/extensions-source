import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://xyzcomics.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function list(url: string): Promise<MangaPage> {
  const document = await load(url);
  const items = document.select('article.post').flatMap((post): MangaSummary[] => {
    const link = post.selectFirst('figure.post-image a');
    const title = post.selectFirst('h2.post-title a');
    if (!link || !title) return [];
    const img = post.selectFirst('figure.post-image img.wp-post-image');
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: title.text().trim(),
        thumbnailUrl: img?.absUrl('data-src') || img?.absUrl('src') || undefined,
      },
    ];
  });
  return {
    items,
    hasNextPage: document.selectFirst('a.nextp, .pagenav a.next, a.page-numbers.next, a[rel=next]') != null,
  };
}

const paged = (path: string, page: number, query = '') =>
  `${BASE_URL}${path}${page > 1 ? `page/${page}/` : ''}${query}`;

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(paged('/allsexkomix/', page)),
    search(query: string, page: number, filters: FilterState) {
      const tag = typeof filters.tag === 'string' ? filters.tag.trim() : '';
      if (tag) {
        const slug = tag
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/^-+|-+$/g, '');
        return list(paged(`/tag/${slug}/`, page));
      }
      return list(paged('/', page, `?s=${encodeURIComponent(query.trim())}`));
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: `See all artists & tags: ${BASE_URL}/all-the-artists-and-tags/` },
      { type: 'separator' },
      { type: 'text', id: 'tag', label: 'Artist or Tag' },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      return {
        url: manga.url,
        title:
          document.selectFirst('h1.post-title a, h1.post-title')?.text() ||
          document.selectFirst('title')?.text() ||
          manga.title,
        thumbnailUrl:
          document.selectFirst('.pswp-gallery .pswp-gallery__item a[href]')?.absUrl('href') || manga.thumbnailUrl,
        genres: document.select('a.post-tag-button').map((a) => a.text().trim()),
        status: 'unknown',
      };
    },
    getChapters: async (manga: MangaSummary): Promise<Chapter[]> => [{ url: manga.url, name: 'Chapter 1', number: 1 }],
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('.pswp-gallery .pswp-gallery__item a[href]')
        .map((a, index) => ({ index, imageUrl: a.absUrl('href') || a.attr('href') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
