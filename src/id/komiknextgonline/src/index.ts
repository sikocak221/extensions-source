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
import { USER_AGENT, hostOf, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://komiknextgonline.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

// One-shot children's comics: each comic is a single chapter.

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function mangaFromElement(element: HtmlElement): MangaSummary | null {
  const title = element
    .selectFirst('.comic-title, .entry-title')
    ?.text()
    .replace(/^#\d+\.\s*/, '');
  const link = element.selectFirst('a');
  if (!title || !link) return null;
  return {
    url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
    title,
    thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
  };
}

const option = (label: string, value: string) => ({ label, value });

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    // The home page no longer lists comics; the comic archive only has covers.
    async getPopular(page: number): Promise<MangaPage> {
      const document = await fetchDocument(`${BASE_URL}/comic/page/${page}/`);
      const items = document.select('span.comic-thumbnail-wrapper').flatMap((element): MangaSummary[] => {
        const img = element.selectFirst('img');
        const link = element.selectFirst('a');
        if (!img || !link) return [];
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            title: (img.attr('alt') ?? '').replace(/\s+cover$/i, ''),
            thumbnailUrl: img.absUrl('src') || undefined,
          },
        ];
      });
      return { items, hasNextPage: document.selectFirst('.nav-previous a') != null };
    },

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      let url: string;
      if (query.trim()) url = withQuery(`${BASE_URL}/${page > 1 ? `page/${page}/` : ''}`, { s: query.trim() });
      else {
        const category = typeof state.category === 'string' ? state.category : '';
        url = withQuery(category ? `${BASE_URL}/${category}` : BASE_URL, {
          comics_paged: page > 1 ? String(page) : undefined,
        });
      }
      const document = await fetchDocument(url);
      const items = document
        .select('#left-content ul#comic-list li.comic, #left-content article.comic')
        .map(mangaFromElement)
        .filter((m): m is MangaSummary => m !== null);
      return { items, hasNextPage: document.selectFirst('a.next.page-numbers') != null };
    },

    getFilters: (): Filter[] => [
      { type: 'header', label: 'Filter akan diabaikan jika ada pencarian teks' },
      {
        type: 'select',
        id: 'category',
        label: 'Kategori',
        options: [
          option('Semua', ''),
          option('Pendidikan', 'pendidikan'),
          option('Persahabatan', 'persahabatan'),
          option('Anak Islami', 'anak-islami'),
          option('Horor dan Misteri', 'horor-dan-misteri'),
        ],
      },
    ],

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const meta = (property: string) => document.selectFirst(`meta[property="${property}"]`);
      return {
        url: manga.url,
        title: (meta('og:title')?.attr('content') ?? manga.title).split(' - ')[0]!,
        description: meta('og:description')?.attr('content') || undefined,
        thumbnailUrl: meta('og:image')?.absUrl('content') || manga.thumbnailUrl,
        status: 'completed',
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const url = document.selectFirst('meta[property="og:url"]')?.attr('content');
      const published = Date.parse(
        document.selectFirst('meta[property="article:published_time"]')?.attr('content') ?? '',
      );
      return [
        {
          url: url ? relativeUrl(url) : manga.url,
          name: 'Chapter 1',
          number: 1,
          uploadedAt: Number.isFinite(published) ? published : undefined,
        },
      ];
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
      return document
        .select('div#spliced-comic img')
        .map((img) => img.absUrl('src') || img.attr('src') || '')
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/comic\/[^/?#]+\/?)/i.exec(url.trim());
      return match && match[1]?.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
