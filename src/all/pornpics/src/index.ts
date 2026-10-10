import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type SourceInfo,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://www.pornpics.com';
const PAGE_SIZE = 19;
const MANGA_SELECTOR = '#main li.thumbwook > a.rel-link';

const CATEGORY_OPTIONS: [string, string][] = [
  ['Default', '/default'], ['Asian', 'asian'], ['Chinese', 'chinese'], ['Korean', 'korean'], ['Japanese', 'japanese'],
  ['Russian', 'russian'], ['Ukrainian', 'ukrainian'], ['Big tits', 'big-tits'], ['Natural tits', 'natural-tits'],
  ['Cosplay', 'cosplay'], ['Cute', 'cute'], ['Glasses', 'glasses'], ['Maid', 'maid'], ['Nurse', 'nurse'], ['Nun', 'nun'],
  ['Stockings', 'stockings'], ['Twins', 'twins'],
]; // prettier-ignore

interface GalleryDto {
  desc: string;
  g_url: string;
  t_url: string;
}

const slugToTitle = (url: string) =>
  url
    .replace(/\/+$/, '')
    .split('/')
    .pop()!
    .replace(/^./, (c) => c.toUpperCase())
    .split('-')
    .filter((part) => !/^\d+$/.test(part))
    .join(' ');

export default defineExtension({
  preferences: () => [
    {
      type: 'select',
      key: 'PornPics::CATEGORY',
      label: 'Default category',
      description: 'Category used by the popular and latest lists',
      options: CATEGORY_OPTIONS.map(([label, value]) => ({ label, value })),
      default: '/default',
    },
  ],

  createSource: (info: SourceInfo) => {
    const lang = info.lang === 'ja' ? 'jp' : info.lang;
    const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Cookie: 'pp_lang=' };

    async function mangasPage(url: string, query: Record<string, string>, offset: number): Promise<MangaPage> {
      const response = await http.get(withQuery(url, query), { headers });
      const asJson = 'q' in query || 'period' in query || offset > 0;
      let mangas: MangaSummary[];
      if (asJson) {
        mangas = (JSON.parse(response.body) as GalleryDto[]).map((g) => ({
          url: relativeUrl(g.g_url),
          title: g.desc || slugToTitle(g.g_url),
          thumbnailUrl: g.t_url,
        }));
      } else {
        const document = html.load(response.body, { baseUrl: response.url });
        mangas = document.select(MANGA_SELECTOR).flatMap((a): MangaSummary[] => {
          const img = a.selectFirst('img');
          if (!img) return [];
          return [
            {
              url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
              title: img.attr('alt') ?? '',
              thumbnailUrl: img.absUrl('data-src') || undefined,
            },
          ];
        });
      }
      // One extra gallery is requested to find out whether there is a next page.
      const hasNextPage = mangas.length > PAGE_SIZE;
      return { items: hasNextPage ? mangas.slice(0, -1) : mangas, hasNextPage };
    }

    const paging = (page: number): Record<string, string> => ({
      limit: String(PAGE_SIZE + 1),
      offset: String((page - 1) * PAGE_SIZE),
    });

    async function browse(page: number, popular: boolean): Promise<MangaPage> {
      const category = prefs.get<string>('PornPics::CATEGORY') ?? '/default';
      if (category === '/default') {
        const period = popular ? 1 : 2;
        return mangasPage(
          `${BASE_URL}/popular/api/galleries/list/`,
          { ...paging(page), lang, period: String(period), category_id: String(2585 + period) },
          (page - 1) * PAGE_SIZE,
        );
      }
      return mangasPage(
        `${BASE_URL}/${category}/${popular ? '' : 'recent/'}`,
        { ...paging(page), lang },
        (page - 1) * PAGE_SIZE,
      );
    }

    const parseFilterList = (document: HtmlElement) =>
      document
        .select('#main-list .list-item > a')
        .map((a) => ({ label: a.attr('title') || a.text(), value: a.attr('href') ?? '' }));

    return {
      baseUrl: BASE_URL,

      getPopular: (page: number) => browse(page, true),

      getLatest: (page: number) => browse(page, false),

      async getFilters(): Promise<Filter[]> {
        const prefix = lang === 'en' ? '' : `${lang}/`;
        const load = async (path: string) => {
          try {
            const response = await http.get(`${BASE_URL}/${prefix}${path}`, { headers });
            return parseFilterList(html.load(response.body, { baseUrl: response.url }));
          } catch {
            return [];
          }
        };
        const [tagsAndCategories, stars, channels] = await Promise.all([
          load('tags/'),
          load('pornstars/list/'),
          load('channels/list/'),
        ]);
        const select = (id: string, label: string, options: { label: string; value: string }[]): Filter[] =>
          options.length
            ? [
                {
                  type: 'select',
                  id,
                  label,
                  options: [{ label: 'None', value: '' }, ...options.sort((a, b) => a.label.localeCompare(b.label))],
                },
              ]
            : [];
        return [
          {
            type: 'select',
            id: 'sort',
            label: 'Time',
            options: [
              { label: 'Popular', value: '' },
              { label: 'Recent', value: 'recent?date=latest' },
            ],
          },
          { type: 'header', label: 'Ignored when searching by text. The first non-empty selector below is used.' },
          ...select(
            'category',
            'Categories',
            tagsAndCategories.filter((o) => !o.value.includes('/tags/')),
          ),
          ...select(
            'tag',
            'Tags',
            tagsAndCategories.filter((o) => o.value.includes('/tags/')),
          ),
          ...select('star', 'Porn stars', stars),
          ...select('channel', 'Channels', channels),
        ];
      },

      async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
        const sort = typeof state.sort === 'string' ? state.sort : '';
        if (query.trim()) {
          return mangasPage(
            `${BASE_URL}/search/srch.php`,
            { lang, ...paging(page), ...(sort ? { date: 'latest' } : {}), q: query },
            (page - 1) * PAGE_SIZE,
          );
        }
        const selected = ['category', 'tag', 'star', 'channel']
          .map((id) => state[id])
          .find((v) => typeof v === 'string' && v) as string | undefined;
        if (!selected) return browse(page, sort === '');
        const [path, queryString = ''] = selected.split('?');
        const extra = Object.fromEntries(
          queryString
            .split('&')
            .filter(Boolean)
            .map((p) => p.split('=') as [string, string]),
        );
        const sortPath = sort && !selected.includes('/search/srch.php?') ? `/${sort.split('?')[0]}` : '';
        return mangasPage(
          `${BASE_URL}${path}${sortPath}`,
          { ...extra, lang, ...paging(page), ...(sort ? { date: 'latest' } : {}) },
          (page - 1) * PAGE_SIZE,
        );
      },

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const response = await http.get(`${BASE_URL}${manga.url}`, { headers });
        const document = html.load(response.body, { baseUrl: response.url });
        const info = document.selectFirst('div.gallery-info.to-gall-info');
        return {
          url: manga.url,
          title: document.selectFirst('.gallery-title h1')?.text() || manga.title,
          thumbnailUrl: manga.thumbnailUrl ?? document.selectFirst(MANGA_SELECTOR + ' img')?.absUrl('data-src'),
          author:
            info
              ?.select('div.gallery-info__item:nth-child(2) a')
              .map((a) => a.text())
              .join(', ') || undefined,
          genres: info?.select('div.gallery-info__item:not(:nth-child(2)) a').map((a) => a.text()) ?? [],
          description:
            info
              ?.select('.info-rate, .info-views')
              .map((e) => e.text())
              .join(' ') || undefined,
          status: 'completed',
        };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        return [{ url: manga.url, name: 'Gallery', number: 0 }];
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const response = await http.get(`${BASE_URL}${chapter.url}`, { headers });
        const document = html.load(response.body, { baseUrl: response.url });
        return document
          .select(MANGA_SELECTOR)
          .map((a, index) => ({ index, imageUrl: a.absUrl('href') || a.attr('href') || '' }));
      },

      imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),

      resolveUrl(url: string): MangaSummary | null {
        const match = /^https?:\/\/(?:www\.)?pornpics\.com(\/(?:[a-z]{2}\/)?galleries\/[^?#]+)/i.exec(url.trim());
        return match ? { url: match[1]!, title: '' } : null;
      },

      getWebUrl: (item) => `${BASE_URL}${item.url}`,
    };
  },
});
