import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://incase.buttsmithy.com';
const ALFIE_URL = 'https://buttsmithy.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const AUTHOR = 'InCase';

// Alfie lives on its own site: its chapters are entries "/alfie/<chapter slug>" (archive pages there); the other
// comics are entries on this site, read page by page through their "next" links.
async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const alfieSlug = (title: string) =>
  title.toLowerCase() === 'chapter 1' ? 'chapter-1v2' : title.toLowerCase().replace(/[ .]/g, '-');

async function catalogue(): Promise<MangaDetails[]> {
  const alfie = await load(ALFIE_URL);
  const newest = alfie.selectFirst('.comic-chapter a')?.text().toLowerCase();
  const alfies: MangaDetails[] = alfie.select('#chapter option.level-0').map((o) => {
    const title = o.text().toLowerCase();
    return {
      url: `/alfie/${alfieSlug(title)}`,
      title: `Alfie - ${title}`,
      author: AUTHOR,
      artist: AUTHOR,
      genres: ['fantasy', 'NSFW'],
      status: title === newest ? 'unknown' : 'completed',
    };
  });
  const main = await load(BASE_URL);
  const others: MangaDetails[] = main
    .select('#menu-item-331 .menu-item-type-custom a[href], #menu-item-38 .menu-item-type-custom a[href]')
    .filter((a) => !a.text().includes('Alfie'))
    .map((a) => ({
      url: relativeUrl(a.attr('href') ?? ''),
      title: a.text(),
      author: AUTHOR,
      artist: AUTHOR,
      genres: ['NSFW'],
      status: 'completed',
    }));
  return [...alfies, ...others];
}

const toPage = (list: MangaDetails[]): MangaPage => ({
  items: list.map(({ url, title }) => ({ url, title })),
  hasNextPage: false,
});
const absolute = (url: string) =>
  url.startsWith('/alfie/')
    ? `${ALFIE_URL}/archives/chapter/${url.slice(7)}`
    : /^https?:/.test(url)
      ? url
      : `${BASE_URL}${url}`;

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async () => toPage(await catalogue()),
    search: async (query) =>
      toPage((await catalogue()).filter((m) => m.title.toLowerCase().includes(query.trim().toLowerCase()))),
    getMangaDetails: async (manga: MangaSummary) =>
      (await catalogue()).find((m) => m.url === manga.url) ?? { ...manga, status: 'unknown' },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const chapters: Chapter[] = [];
      if (manga.url.startsWith('/alfie/')) {
        // Archive pages list the strips (each one a chapter), newest last after reversing.
        let next: string | null = absolute(manga.url);
        for (const seen = new Set<string>(); next && !seen.has(next);) {
          seen.add(next);
          const document = await load(next);
          document.select('article.has-post-thumbnail .post-content').forEach((post) => {
            const a = post.selectFirst('.post-info .post-title a');
            if (!a) return;
            const title = a.text();
            const date =
              `${post.selectFirst('.post-info .post-time')?.text() ?? ''} ${post.selectFirst('.post-info .post-date')?.text() ?? ''}`.trim();
            chapters.push({
              url: a.attr('href') ?? '',
              name: title,
              number: /^p*\d+$/.test(title) ? Number(title.replace(/^p*/, '')) : chapters.length,
              uploadedAt: parseDate(date, 'H:mm MMMM d, yyyy'),
            });
          });
          next = document.selectFirst('.paginav-next a')?.attr('href') || null;
        }
      } else {
        let next: string | null = absolute(manga.url);
        for (const seen = new Set<string>(); next && !seen.has(next) && seen.size < 1000;) {
          seen.add(next);
          const document = await load(next);
          const img = document.selectFirst('#comic img');
          if (!img) break;
          chapters.push({ url: next, name: img.attr('alt') ?? `Page ${chapters.length + 1}`, number: chapters.length });
          next = document.selectFirst('.comic-nav-next')?.attr('href') || null;
        }
      }
      return chapters.reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const src = (await load(absolute(chapter.url))).selectFirst('#comic img')?.attr('src');
      return src ? [{ index: 0, imageUrl: src }] : [];
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const alfie = /^https?:\/\/(?:www\.)?buttsmithy\.com\/archives\/chapter\/([^/?#]+)/i.exec(url.trim());
      if (alfie) return { url: `/alfie/${alfie[1]}`, title: '' };
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absolute(item.url),
  }),
});
