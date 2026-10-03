import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://comicaurora.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const DESCRIPTION =
  'Aurora is a fantasy webcomic (updates M/W/F) written and illustrated by Red, better known for her work on the YouTube channel ' +
  '“Overly Sarcastic Productions.” It’s been in the works for over a decade, and she’s finally decided to stop putting it off.\n' +
  'If you’d like to discuss the comic, it now has a subreddit, as well as a dedicated twitter and a tumblr where you can ask questions. ' +
  'There’s also a dedicated room on the channel discord for conversations about it!\n' +
  'Find Red’s general ramblings on Twitter, alongside her cohost Blue, at OSPYouTube.';

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

// Every chapter of the story is an entry; its pages are the chapter's posts.
async function catalogue(): Promise<MangaDetails[]> {
  const blocks = (await load('/archive/')).select('.wp-block-image:has(a)');
  return blocks.map((block, i) => {
    const link = block.selectFirst('a');
    return {
      url: relativeUrl(link?.attr('href') ?? ''),
      title: `Aurora - ${link?.text() ?? ''}`.trim(),
      author: 'OSP-Red',
      description: DESCRIPTION,
      genres: ['fantasy'],
      status: i >= blocks.length - 1 ? 'unknown' : 'completed',
      thumbnailUrl: block.selectFirst('img')?.attr('src'),
    };
  });
}

const toPage = (items: MangaDetails[]): MangaPage => ({
  items: items.map(({ url, title, thumbnailUrl }) => ({ url, title, thumbnailUrl })),
  hasNextPage: false,
});

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async () => toPage(await catalogue()),
    search: async (query) =>
      toPage((await catalogue()).filter((m) => m.title.toLowerCase().includes(query.trim().toLowerCase()))),
    getMangaDetails: async (manga: MangaSummary) =>
      (await catalogue()).find((m) => m.url === manga.url) ?? { ...manga, status: 'unknown' },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const first = await load(manga.url);
      const pages = [first];
      for (const a of first.select('#paginav a[title]').slice(1)) pages.push(await load(a.attr('href') ?? ''));
      return pages
        .flatMap((page) =>
          page.select('.post-content').map((post) => {
            const title = post
              .select('.post-title a')
              .map((a) => a.text())
              .join(' ');
            return {
              url: relativeUrl(post.selectFirst('a.webcomic-link')?.attr('href') ?? ''),
              name: title,
              number: Number(title.split('.').slice(1).join('.').split('-')[0]) || undefined,
              uploadedAt: parseDate(
                post
                  .select('.post-date')
                  .map((e) => e.text())
                  .join(' '),
                'MMMM dd, yyyy',
              ),
            };
          }),
        )
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('.webcomic-media .webcomic-link .attachment-full')
        .map((img, index) => ({ index, imageUrl: img.attr('src') ?? '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
