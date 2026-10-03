import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://tcbonepiecechapters.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function projects(query = ''): Promise<MangaPage> {
  const q = query.trim().toLowerCase();
  const items = (await load('/projects')).select('div.bg-card').flatMap((card): MangaSummary[] => {
    const link = card.selectFirst('a[href].text-white');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: link.text(),
        thumbnailUrl: card.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items: items.filter((m) => !q || m.title.toLowerCase().includes(q)), hasNextPage: false };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => projects(),
    search: (query) => projects(query),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const info = (await load(manga.url)).selectFirst('div.order-1');
      return {
        url: manga.url,
        title: info?.selectFirst('h1')?.text() || manga.title,
        thumbnailUrl: info?.selectFirst('img')?.absUrl('src') || manga.thumbnailUrl,
        description: info?.selectFirst('p')?.text() || undefined,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return (await load(manga.url)).select('div.grid a').map((a) => {
        const title = a
          .select('div.font-bold:not(.flex)')
          .map((e) => e.text())
          .join(' ');
        const description = a.selectFirst('.text-gray-500')?.text();
        const number = /\d+.?\d+$/.exec(title)?.[0];
        return {
          url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
          name: `${number ? `Chapter ${number}` : title}${description ? `: ${description}` : ''}`,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('picture img, .image-container img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/mangas\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
