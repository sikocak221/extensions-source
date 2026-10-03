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

const BASE_URL = 'https://colorizedmangas.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

// The home page holds the whole library (colour and black & white views).
async function library(query = ''): Promise<MangaPage> {
  const seen = new Set<string>();
  const q = query.trim().toLowerCase();
  const items = (await load('/'))
    .select('div.lib-color-view a[href], div.lib-bw-view a[href]')
    .flatMap((a): MangaSummary[] => {
      const slug = (a.attr('href') ?? '').replace(/\/+$/, '').split('/').pop() ?? '';
      const title = a.selectFirst('h3')?.text();
      if (!slug || !title || seen.has(slug)) return [];
      seen.add(slug);
      return [{ url: `/${slug}`, title, thumbnailUrl: a.selectFirst('img')?.absUrl('src') || undefined }];
    });
  return { items: items.filter((m) => !q || m.title.toLowerCase().includes(q)), hasNextPage: false };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => library(),
    getLatest: () => library(),
    search: (query) => library(query),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const aside = (await load(manga.url)).selectFirst('aside');
      const genres = aside?.selectFirst('p.text-\\[11px\\]')?.text();
      return {
        url: manga.url,
        title: (aside?.selectFirst('h1')?.text() ?? manga.title).replace(/^Colorized/, '').trim(),
        thumbnailUrl: aside?.selectFirst('img')?.absUrl('src') || manga.thumbnailUrl,
        author: aside?.selectFirst('dl > div dt:contains(Author) + dd')?.text() || undefined,
        genres: genres
          ?.split('·')
          .map((g) => g.trim())
          .filter(Boolean),
        description: aside?.selectFirst('p.border-t')?.text() || undefined,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const chapters = (await load(manga.url))
        .select('div.space-y-4 section div.space-y-2 > a')
        .flatMap((a): Chapter[] => {
          const num = a.selectFirst('span.font-bold')?.text() || undefined;
          const title = a.selectFirst('div.truncate')?.text() || undefined;
          if (!num && !title) return [];
          const name = num ? (title && title.toLowerCase() !== num.toLowerCase() ? `${num} - ${title}` : num) : title!;
          return [
            {
              url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
              name,
              number: Number(/\d+(\.\d+)?/.exec(num ?? title ?? '')?.[0] ?? -1),
            },
          ];
        });
      return chapters.sort((a, b) => (b.number ?? 0) - (a.number ?? 0) || b.name.localeCompare(a.name));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('main img[src*=pages]')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
