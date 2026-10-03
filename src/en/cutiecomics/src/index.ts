import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, ownText, relativeUrl } from './common/utils';

const BASE_URL = 'https://cutiecomics.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

function parseList(document: HtmlElement): MangaPage {
  const items = document.select('#dle-content > div.w25').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('strong.field-content > a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.attr('href') ?? ''),
        title: ownText(link),
        thumbnailUrl: element.selectFirst('a > img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('.navigation > a > i.fa-angle-right') != null };
}

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseList(await load(`/page/${page}`)),
    async search(query: string, page: number): Promise<MangaPage> {
      const story = query.trim();
      if (story.length < 4) throw new Error('Invalid search! It should have at least 4 non-blank characters.');
      const form = {
        do: 'search',
        subaction: 'search',
        full_search: '0',
        search_start: String(page),
        result_from: String((page - 1) * 20 + 1),
        story,
      };
      const response = await http.post(`${BASE_URL}/index.php?do=search`, { form }, { headers });
      return parseList(html.load(response.body, { baseUrl: response.url }));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      return {
        url: manga.url,
        title: document.selectFirst('h1#page-title')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('div.galery > img')?.absUrl('src') || manga.thumbnailUrl,
        genres: document.select('h3.field-label ~ span').map((e) => e.text()),
        status: 'completed',
      };
    },
    getChapters: async (manga: MangaSummary): Promise<Chapter[]> => [{ url: manga.url, name: 'Chapter', number: 1 }],
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('div.galery > img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
