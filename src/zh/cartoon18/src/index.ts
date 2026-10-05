import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://www.cartoon18.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const ZH_HANT: Preference = { type: 'switch', key: 'ZH_HANT', label: 'Use Traditional Chinese', default: false };

const SORTS: [string, string][] = [
  ['Latest', 'created'],
  ['Popular', 'hits'],
  ['Recommended', 'score'],
  ['Best', 'likes'],
];

const root = () => (prefs.get<boolean>(ZH_HANT.key) ? BASE_URL : `${BASE_URL}/zh-hans`);

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function mangaParse(document: HtmlElement): MangaPage {
  const items = document.select('#videos div.card').flatMap((card): MangaSummary[] => {
    const link = card.selectFirst('.lines-2 a') ?? card.selectFirst('a.visited');
    const title = link?.text().trim();
    if (!link || !title) return [];
    const img = card.selectFirst('.embed-responsive img') ?? card.selectFirst('img');
    return [
      {
        url: link.attr('href') ?? '',
        title,
        thumbnailUrl: img?.absUrl('data-src') || img?.absUrl('src') || undefined,
      },
    ];
  });
  const next = document.selectFirst('nav .pagination .next');
  return { items, hasNextPage: next != null && !(next.attr('class') ?? '').split(/\s+/).includes('disabled') };
}

export default defineExtension({
  preferences: () => [ZH_HANT],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => mangaParse(await load(`${root()}?sort=hits&page=${page}`)),
    getLatest: async (page) => mangaParse(await load(`${root()}?sort=created&page=${page}`)),
    async search(query, page, filters): Promise<MangaPage> {
      const params: [string, string][] = [];
      if (query.trim()) params.push(['q', query.trim()]);
      params.push(['page', String(page)]);
      const keyword = filters.keyword;
      if (!query.trim() && typeof keyword === 'string' && keyword) params.push(['q', keyword]);
      const sort = typeof filters.sort === 'string' && filters.sort ? filters.sort : 'score';
      params.push(['sort', sort]);
      const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      return mangaParse(await load(`${root()}?${qs}`));
    },
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [
        {
          type: 'select',
          id: 'sort',
          label: 'Sort by',
          options: SORTS.map(([label, value]) => ({ label, value })),
          default: 'score',
        },
      ];
      try {
        const document = await load(`${root()}/category`);
        const keywords = document.select('div.content a.btn').flatMap((btn) => {
          const href = btn.attr('href') ?? '';
          const label = btn.text().trim();
          if (!label || !href) return [];
          const last = href.split('/').pop() ?? '';
          let value = last;
          try {
            value = decodeURIComponent(last);
          } catch {
            /* keep the raw segment */
          }
          return [{ label, value }];
        });
        if (keywords.length)
          filters.push({
            type: 'select',
            id: 'keyword',
            label: 'Keyword',
            options: [{ label: 'None', value: '' }, ...keywords],
            default: '',
          });
      } catch (error) {
        log.warn('Cannot load keywords', error);
      }
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const title = document.selectFirst('div.content h1.title')?.html().split('<')[0]?.trim();
      const spans = (icon: string) => document.select(`div.content h1.title ~ div.row div.my-2:has(i.${icon}) span`);
      const author = spans('fa-user')[1]?.text().trim();
      const description = spans('fa-list')[1]?.text().trim();
      const genres = document
        .select('div.content h1.title ~ div.row div.my-2:has(i.fa-tag) span:has(a) a')
        .map((a) => a.text().trim())
        .filter(Boolean);
      const img = document.selectFirst('div.content h1.title ~ div.row a img');
      return {
        url: manga.url,
        title: title || manga.title,
        thumbnailUrl: img?.absUrl('src') || img?.absUrl('data-src') || manga.thumbnailUrl,
        author: author?.replace(/,(\S)/g, ', $1') || undefined,
        description: description || undefined,
        genres,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      return document
        .select('div.content h1.title + div a')
        .flatMap((el): Chapter[] => {
          const name = el.text().trim();
          return name ? [{ url: el.attr('href') ?? '', name }] : [];
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(absoluteUrl(BASE_URL, chapter.url));
      return document
        .select('div#app img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.absUrl('data-src') || '' }))
        .filter((page) => page.imageUrl)
        .map((page, index) => ({ ...page, index }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)((?:\/zh-hans)?\/v\/[^?#]+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
