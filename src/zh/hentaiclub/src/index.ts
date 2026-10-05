import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://www.hentaiclub.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const SORTS: [string, string][] = [
  ['全部', ''],
  ['R-15', 'r15'],
  ['R-18', 'r18'],
];

async function load(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(url, { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

async function parseMangaList(url: string): Promise<MangaPage> {
  const { document } = await load(url);
  const items = document.select('div.item').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('a.item-link');
    if (!link) return [];
    const img = element.selectFirst('img.item-img');
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: element.selectFirst('.item-link-text')?.text() ?? '',
        thumbnailUrl: img?.absUrl('data-original') || img?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: items.length >= 24 };
}

const popular = (page: number) => parseMangaList(page === 1 ? `${BASE_URL}/` : `${BASE_URL}/page/${page}/`);

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: popular,
    async search(query, page, filters): Promise<MangaPage> {
      if (query.trim()) {
        const base = `${BASE_URL}/search/${encodeURIComponent(query.trim())}`;
        return parseMangaList(page > 1 ? `${base}/${page}/` : `${base}/`);
      }
      const tag = typeof filters.tag === 'string' ? filters.tag.trim() : '';
      if (tag) {
        const base = `${BASE_URL}/tag/${encodeURIComponent(tag)}/`;
        return parseMangaList(page > 1 ? `${base}${page}/` : base);
      }
      const sort = typeof filters.sort === 'string' ? filters.sort : '';
      if (sort) return parseMangaList(`${BASE_URL}/sort/${sort}.html`);
      return popular(page);
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: '分类',
        options: SORTS.map(([label, value]) => ({ label, value })),
        default: '',
      },
      { type: 'text', id: 'tag', label: '标签 (输入标签名)' },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document, url } = await load(absoluteUrl(BASE_URL, manga.url));
      const content = document.selectFirst('.content');
      const tags = (content?.select('a[href*="/tag/"]') ?? []).map((a) => a.text());
      const views = /浏览[：:]\s*(\d+)次/.exec(content?.text() ?? '')?.[1];
      return {
        url: manga.url,
        title: document.selectFirst('title')?.text().split(' - 绅士会所')[0] || manga.title,
        thumbnailUrl: content?.selectFirst('div.post-item[data-src]')?.absUrl('data-src') || manga.thumbnailUrl,
        author: tags[0],
        genres: tags,
        description: views ? `浏览量：${views}次` : undefined,
        status: url.includes('/r18/') ? 'completed' : 'ongoing',
      };
    },
    // Every post is a single chapter.
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return [{ url: manga.url, name: '章节 1' }];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(absoluteUrl(BASE_URL, chapter.url));
      return document
        .select('div.post-item[data-src]')
        .map((el, index) => ({ index, imageUrl: el.absUrl('data-src') ?? '' }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
