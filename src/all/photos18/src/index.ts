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
import { USER_AGENT, withQuery } from './common/utils';

const BASE_URL = 'https://www.photos18.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const stripLang = (url: string) => url.replace(/^\/zh-hans/, '');
const useTraditional = () => prefs.get<boolean>('ZH_HANT') === true;
const langBase = () => (useTraditional() ? BASE_URL : `${BASE_URL}/zh-hans`);

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function parseMangaList(document: HtmlElement): MangaPage {
  const items = (document.selectFirst('#videos')?.select(':scope > *') ?? []).flatMap((el): MangaSummary[] => {
    const body = el.selectFirst('.card-body');
    const link = body?.select('a').find((a) => a.text().trim()) ?? body?.selectFirst('a');
    if (!body || !link || !link.text().trim()) return [];
    const src = el.selectFirst('img')?.attr('src') ?? '';
    return [
      {
        url: stripLang(link.attr('href') ?? ''),
        title: link.text(),
        thumbnailUrl: src.startsWith('http') ? src : BASE_URL + src,
      },
    ];
  });
  const next = document.selectFirst('.next');
  return { items, hasNextPage: next != null && !(next.attr('class') ?? '').split(/\s+/).includes('disabled') };
}

export default defineExtension({
  preferences: () => [{ type: 'switch', key: 'ZH_HANT', label: 'Use Traditional Chinese', default: false }],

  createSource: () => ({
    baseUrl: BASE_URL,

    async getPopular(page: number): Promise<MangaPage> {
      return parseMangaList(await fetchDocument(`${langBase()}/sort/views?page=${page}`));
    },

    async getLatest(page: number): Promise<MangaPage> {
      return parseMangaList(await fetchDocument(`${langBase()}/?page=${page}`));
    },

    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [
        {
          type: 'select',
          id: 'sort',
          label: 'Sort by',
          default: 'views',
          options: [
            { label: 'Latest', value: 'created' },
            { label: 'Popular', value: 'hits' },
            { label: 'Trend', value: 'views' },
            { label: 'Recommended', value: 'score' },
            { label: 'Best', value: 'likes' },
          ],
        },
      ];
      try {
        const document = await fetchDocument(`${langBase()}/`);
        const options = (document.selectFirst('#w2')?.select(':scope > *') ?? []).map((el) => ({
          label: el.text().split(' (')[0]!,
          value: (el.selectFirst('a')?.attr('href') ?? '').split('/').pop()!,
        }));
        if (options.length)
          filters.push({
            type: 'select',
            id: 'category',
            label: 'Category',
            options: [{ label: 'All', value: '' }, ...options],
          });
      } catch {
        // Categories are optional.
      }
      return filters;
    },

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const params: Record<string, string> = { q: query, page: String(page) };
      if (typeof state.sort === 'string') params.sort = state.sort;
      if (typeof state.category === 'string') params.category_id = state.category;
      return parseMangaList(await fetchDocument(withQuery(`${langBase()}/`, params)));
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return { url: manga.url, title: manga.title, thumbnailUrl: manga.thumbnailUrl, status: 'completed' };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return [{ url: manga.url, name: 'Gallery', number: 0 }];
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
      return (document.selectFirst('#content')?.select('img') ?? []).map((img, index) => ({
        index,
        imageUrl: img.absUrl('src') || img.attr('src') || '',
      }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?photos18\.com(?:\/zh-hans)?(\/v\/[^/?#]+)/i.exec(url.trim());
      return match ? { url: match[1]!, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
