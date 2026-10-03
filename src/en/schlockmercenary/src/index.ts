import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://www.schlockmercenary.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const CHAPTERS = 'ul.chapters > li > a';

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

// Every book of the archive is an entry; chapter links end with their first strip's date.
async function books(): Promise<{ details: MangaDetails; book: HtmlElement }[]> {
  return (await load('/archives/')).select('div.archive-book').flatMap((book) => {
    const link = book.selectFirst('h4 > a');
    if (!link) return [];
    const thumb = book.selectFirst('img')?.absUrl('src') || `${BASE_URL}/static/img/logo.b6dacbb8.jpg`;
    return [
      {
        book,
        details: {
          url: link.attr('href') ?? '',
          title: link.text(),
          author: 'Howard Tayler',
          artist: 'Howard Tayler',
          status: 'completed' as const,
          description: book.selectFirst('p')?.text(),
          thumbnailUrl: thumb.split('?')[0],
        },
      },
    ];
  });
}

const toPage = (items: MangaDetails[]): MangaPage => ({
  items: items.map(({ url, title, thumbnailUrl }) => ({ url, title, thumbnailUrl })),
  hasNextPage: false,
});
const dateOf = (href: string) => href.slice(-10);
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async () => toPage((await books()).map((b) => b.details)),
    search: async (query) =>
      toPage(
        (await books()).map((b) => b.details).filter((m) => m.title.toLowerCase().includes(query.trim().toLowerCase())),
      ),
    getMangaDetails: async (manga: MangaSummary) =>
      (await books()).find((b) => b.details.url === manga.url)?.details ?? { ...manga, status: 'unknown' },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const book = (await books()).find((b) => b.details.url === manga.url)?.book;
      return (book?.select(CHAPTERS) ?? [])
        .map((a, index) => ({
          url: a.attr('href') ?? '',
          name: a.text(),
          number: index + 1,
          uploadedAt: day(dateOf(a.attr('href') ?? '')) || undefined,
        }))
        .reverse();
    },
    // A chapter runs from its date to the next chapter's: one site page (with one or more strips) per day.
    async getPages(chapter: Chapter): Promise<Page[]> {
      const links = (await load('/archives/')).select(CHAPTERS).map((a) => a.attr('href') ?? '');
      const at = links.indexOf(chapter.url);
      if (at < 0) return [];
      const start = day(dateOf(chapter.url));
      const end = links[at + 1] ? day(dateOf(links[at + 1]!)) : start + 86_400_000;
      const pages: Page[] = [];
      for (let t = start; t < end; t += 86_400_000) {
        const iso = new Date(t).toISOString().slice(0, 10);
        const document = await load(`/${iso}`);
        for (const img of document.select(`div#strip-${iso} > img`))
          pages.push({ index: pages.length, imageUrl: img.absUrl('src') || img.attr('src') || '' });
      }
      return pages;
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
