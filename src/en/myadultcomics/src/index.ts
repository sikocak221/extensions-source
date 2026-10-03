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
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://myadultcomics.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string) {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return { url: response.url, body: response.body, document: html.load(response.body, { baseUrl: response.url }) };
}

function parseList(document: HtmlElement): MangaPage {
  const items = document.select('td.list_container').flatMap((cell): MangaSummary[] => {
    const link = cell.selectFirst('p.text_container > a');
    const href = link?.absUrl('href') || link?.attr('href');
    if (!link || !href || !link.text()) return [];
    return [
      {
        url: relativeUrl(href),
        title: link.text(),
        thumbnailUrl: cell.selectFirst('img.fon_pic_img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.select('td.tbl_page a').some((a) => a.text().includes('>>')) };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseList((await load(`/index.php?page=${page}`)).document),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const type = typeof filters.type === 'string' && filters.type ? filters.type : 'title';
      const q = encodeURIComponent(query.trim());
      const url =
        type === 'title'
          ? `/index.php?${q ? `name=${q}&` : ''}search=yes&page=${page}`
          : `/index.php?search=${q}&sort=${type}&page=${page}`;
      return parseList((await load(url)).document);
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Use the text search field along with the type below.' },
      {
        type: 'select',
        id: 'type',
        label: 'Search Type',
        options: ['Title', 'Parody', 'Character', 'Tag', 'Artist'].map((label, i) => ({
          label,
          value: i === 0 ? 'title' : String(i),
        })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const links = (label: string) =>
        selectIgnoreCase(document, `p.text_info_book:contains(${label}) a`).map((a) => a.text());
      const artists = links('Artists:').join(', ') || undefined;
      return {
        url: manga.url,
        title: document.selectFirst('h1#TOP')?.text() || manga.title,
        genres: links('Tags:'),
        artist: artists,
        author: artists,
        status: 'completed',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { url } = await load(manga.url);
      return [{ url: relativeUrl(url), name: 'Gallery' }];
    },
    // The reader builds its pages from a script template with "books/..." image paths.
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { body } = await load(chapter.url);
      const script = body.split(/<script[^>]*>/).find((s) => s.includes('let template')) ?? '';
      return [...script.matchAll(/src=["'](books\/[^"']+)["']/g)].map((m, index) => ({
        index,
        imageUrl: `${BASE_URL}/${m[1]}`,
      }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
