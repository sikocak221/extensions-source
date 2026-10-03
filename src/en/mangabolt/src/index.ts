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

const BASE_URL = 'https://mangabolt.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function list(page: number, query: string): Promise<MangaPage> {
  const url = `${BASE_URL}/manga-list/?page=${page}${query ? `&search=${encodeURIComponent(query)}` : ''}&_=/`;
  const data = (
    await http.get<{
      mangas: { name: string; slug: string; image_url?: string | null }[];
      next_page_url?: string | null;
    }>(url, {
      headers: { ...headers, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
      responseType: 'json',
    })
  ).body;
  return {
    items: data.mangas.map((m) => ({
      url: `/manga/${m.slug}/`,
      title: m.name,
      thumbnailUrl: m.image_url || undefined,
    })),
    hasNextPage: data.next_page_url != null,
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(page, ''),
    search: (query, page) => list(page, query.trim()),
    async getLatest(): Promise<MangaPage> {
      const document = await load('/latest');
      const seen = new Set<string>();
      const items = document
        .select('div.bg-bg-secondary:has(a[href*="/chapter/"])')
        .flatMap((element): MangaSummary[] => {
          const link = element.selectFirst('a[href*="/chapter/"]')?.attr('href') ?? '';
          const slug = (link.split('/chapter/')[1] ?? '').split('-chapter-')[0];
          const title = element
            .select('.font-bold')
            .map((e) => e.text())
            .join(' ')
            .split('Chapter')[0]!
            .trim();
          if (!slug || !link.includes('-chapter-') || !title || seen.has(slug)) return [];
          seen.add(slug);
          return [
            { url: `/manga/${slug}/`, title, thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined },
          ];
        });
      return { items, hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const title = document.selectFirst('#main-content h1')?.text().trim();
      if (!title) throw new Error('Missing title');
      return {
        url: manga.url,
        title,
        description:
          document
            .select('div.bg-bg-secondary div.px-6 div.flex-col div.text-text-muted')
            .map((e) => e.text())
            .join(' ')
            .trim() || undefined,
        thumbnailUrl: document.selectFirst('div.flex img')?.absUrl('src') || manga.thumbnailUrl,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document.select('div.w-full div.bg-bg-secondary:has(div.grid)').flatMap((element): Chapter[] => {
        const link = element.selectFirst('div.grid a');
        if (!link) return [];
        const secondary =
          link.selectFirst('.text-xs')?.text() ?? element.selectFirst('div.grid .text-xs')?.text() ?? '';
        const name = link.text().replace(secondary, '').trim() || link.text();
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            name: secondary && secondary.toUpperCase() !== 'READ' ? `${name} - ${secondary}` : name,
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      const urls = document
        .select('.js-pages-container img.js-page')
        .map((img) => (img.attr('data-src') ? img.absUrl('data-src') : img.absUrl('src')) || '')
        .filter((u) => u && !u.includes('data:image'));
      return [...new Set(urls)].map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}/`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
