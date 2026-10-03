import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://killsixbilliondemons.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const AUTHOR = 'Abbadon';
const ORDER = '?order=ASC';
const GROUP_ENDED: Preference = {
  type: 'switch',
  key: 'group_ended',
  label: 'Group ended chapters',
  description: 'Group pages into chapters once they have ended; pages of the running chapter stay listed one by one.',
  default: false,
};
const DESCRIPTION =
  'A webcomic in graphic novel style, meant to be read in large chunks, by a mysterious comics goblin named Abbadon (@orbitaldropkick). ' +
  'It updates Tuesday and Friday evenings. Print copies of the books are published by Image Comics.';

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

// The chapter menu mixes books ("Book 1: ...") and their numbered chapters, in order.
interface Option {
  text: string;
  value: string;
  book: boolean;
}
async function options(): Promise<{ document: HtmlElement; list: Option[] }> {
  const document = await load('/');
  const list = document
    .select('#chapter option')
    .map((o) => ({
      text: o
        .text()
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
      value: o.attr('value') ?? '',
    }))
    .filter((o) => o.value !== '0' && o.text.toLowerCase() !== 'select chapter')
    .map((o) => ({ ...o, book: Number.isNaN(Number(o.text.split(' (')[0]!.trim())) }));
  return { document, list };
}

const unthumb = (src: string) => src.replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp|gif)(?:\?.*)?$)/i, '');

async function books(): Promise<MangaDetails[]> {
  const { document, list } = await options();
  const newest = document.selectFirst('.post-title')?.text().toLowerCase() ?? '';
  const result: MangaDetails[] = [];
  for (const o of list.filter((o) => o.book)) {
    const title = o.text.split(' (')[0]!;
    const thumb = (await load(`${o.value}${ORDER}`)).selectFirst('.comic-thumbnail-in-archive a img')?.attr('src');
    result.push({
      url: relativeUrl(o.value),
      title,
      author: AUTHOR,
      artist: AUTHOR,
      description: DESCRIPTION,
      thumbnailUrl: thumb,
      status: newest.includes((title.split(': ')[1] ?? title).toLowerCase()) ? 'unknown' : 'completed',
    });
  }
  return result;
}

// Every archive page of a chapter (paged by "next" links), oldest first.
async function archive(url: string): Promise<HtmlElement[]> {
  const pages: HtmlElement[] = [];
  let next: string | null = `${url}${ORDER}`;
  for (const seen = new Set<string>(); next && !seen.has(next);) {
    seen.add(next);
    const document = await load(next);
    pages.push(document);
    next = document.selectFirst('.paginav-next a')?.attr('href') || null;
  }
  return pages;
}

const toPage = (list: MangaDetails[]): MangaPage => ({
  items: list.map(({ url, title, thumbnailUrl }) => ({ url, title, thumbnailUrl })),
  hasNextPage: false,
});

export default defineExtension({
  preferences: () => [GROUP_ENDED],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async () => toPage(await books()),
    search: async (query) =>
      toPage((await books()).filter((b) => b.title.toLowerCase().includes(query.trim().toLowerCase()))),
    getMangaDetails: async (manga: MangaSummary) =>
      (await books()).find((b) => b.url === manga.url) ?? { ...manga, status: 'unknown' },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { list } = await options();
      const start = list.findIndex(
        (o) =>
          o.book &&
          relativeUrl(o.value).replace(/\/$/, '').toLowerCase() === manga.url.replace(/\/$/, '').toLowerCase(),
      );
      if (start < 0) return [];
      const end = list.findIndex((o, i) => i > start && o.book);
      const chapters = list.slice(start + 1, end < 0 ? undefined : end);
      const group = prefs.get<boolean>(GROUP_ENDED.key) === true;
      const lastIndex = chapters.length - 1;
      const result: Chapter[] = [];
      for (let i = 0; i < chapters.length; i++) {
        const title = `Chapter ${chapters[i]!.text.split(' (')[0]!.trim()}`;
        if (group && i !== lastIndex) {
          result.push({ url: relativeUrl(chapters[i]!.value), name: title, number: i + 1 });
          continue;
        }
        // One chapter per page.
        let n = 0;
        for (const page of await archive(relativeUrl(chapters[i]!.value))) {
          for (const a of page.select('.comic-thumbnail-in-archive a')) {
            const href = a.attr('href');
            if (!href) continue;
            n++;
            const pageTitle = a.attr('title')?.trim();
            result.push({
              url: `${relativeUrl(href)}#page`,
              name: pageTitle ? `${title} - ${pageTitle}` : `${title} Page ${n}`,
              number: i + 1 + n / 1000,
            });
          }
        }
      }
      return result.reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const urls: string[] = [];
      for (const page of await archive(chapter.url.replace(/#page$/, ''))) {
        const thumbs = page.select('.comic-thumbnail-in-archive a img');
        if (thumbs.length) urls.push(...thumbs.map((img) => unthumb(img.attr('src') ?? '')));
        else {
          const src = page.selectFirst('#comic img')?.attr('src');
          if (src) urls.push(unthumb(src));
        }
      }
      return urls.filter(Boolean).map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/chapter\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url.replace(/#page$/, '')),
  }),
});
