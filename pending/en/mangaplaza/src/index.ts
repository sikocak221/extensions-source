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
import { USER_AGENT, absoluteUrl } from './common/utils';
import { descramblePage, fetchPages } from './speedbinb';

const BASE_URL = 'https://mangaplaza.com';
const API_URL = `${BASE_URL}/api`;
const READER_INFO_URL = 'https://reader.mangaplaza.com/sws/apis/bibGetCntntInfo.php';
const HIDE_LOCKED_PREF_KEY = 'hide_locked';
const headers = { 'User-Agent': USER_AGENT, Cookie: 'mp_over18_agreement=ON' };

interface ApiResponse<T> {
  data: T;
}
interface ContentList {
  html_content: string;
  html_page: string;
}
interface GenreList {
  genre_info_list: { genre_id: string; genre_nm: string }[];
  genre_tag_info_list: { genre_tag_id: string; genre_nm: string }[];
}

const SORTS: [label: string, value: string][] = [
  ['Most Recommended', 'recommend'],
  ['Popularity', 'rank'],
  ['Newest', 'new'],
  ['Price: Low to High', 'price_low'],
  ['Price: High to Low', 'price_high'],
  ['Highest Rated', 'review_point'],
  ['Most Reviews', 'review_cnt'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<ApiResponse<T>>(`${API_URL}${path}`, { headers, responseType: 'json' })).body.data;
}

async function search(query: string, page: number, filters: { sort?: string; genre?: string; tag?: string }) {
  let url = `${BASE_URL}/searchresult`;
  if (filters.genre) url += `/genre/${filters.genre}`;
  if (filters.tag) url += `/genre_tag/${filters.tag}`;
  url += `?fre=${encodeURIComponent(query)}&sort=${filters.sort || 'recommend'}&page=${page}`;
  const document = await load(url);
  const items = document.select('ul.listBox > li').flatMap((li): MangaSummary[] => {
    const link = li.selectFirst('.titleName a');
    const id = /\/title\/([^/?#]+)/.exec(link?.absUrl('href') ?? '')?.[1];
    if (!link || !id) return [];
    return [{ url: `/title/${id}/`, title: link.text(), thumbnailUrl: li.selectFirst('figure img')?.absUrl('src') }];
  });
  return { items, hasNextPage: document.selectFirst('.pager li.selected + li a') !== null } satisfies MangaPage;
}

const titleId = (url: string) => /\/title\/([^/?#]+)/.exec(url)?.[1] ?? url;

async function contentPage(id: string, page: number): Promise<ContentList> {
  return api<ContentList>(`/title/content_list?title_id=${id}&order=down&page=${page}`);
}

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED_PREF_KEY, label: 'Hide Locked Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search('', page, { sort: 'rank' }),
    getLatest: (page) => search('', page, { sort: 'new' }),
    search: (query: string, page: number, filters: FilterState) =>
      search(query.trim(), page, {
        sort: typeof filters.sort === 'string' ? filters.sort : undefined,
        genre: typeof filters.genre === 'string' ? filters.genre : undefined,
        tag: typeof filters.tag === 'string' ? filters.tag : undefined,
      }),
    async getFilters(): Promise<Filter[]> {
      const sort: Filter = {
        type: 'select',
        id: 'sort',
        label: 'Sort by',
        options: SORTS.map(([label, value]) => ({ value, label })),
        default: 'recommend',
      };
      try {
        const data = await api<GenreList>('/genre/all_genre');
        const seen = new Set<string>();
        const tags = data.genre_tag_info_list
          .filter((tag) => !seen.has(tag.genre_tag_id) && seen.add(tag.genre_tag_id))
          .sort((a, b) => (a.genre_nm < b.genre_nm ? -1 : a.genre_nm > b.genre_nm ? 1 : 0));
        return [
          sort,
          {
            type: 'select',
            id: 'genre',
            label: 'Genre',
            options: [
              { value: '', label: 'All' },
              ...data.genre_info_list.map((g) => ({ value: g.genre_id, label: g.genre_nm })),
            ],
            default: '',
          },
          {
            type: 'select',
            id: 'tag',
            label: 'Tag',
            options: [{ value: '', label: 'All' }, ...tags.map((t) => ({ value: t.genre_tag_id, label: t.genre_nm }))],
            default: '',
          },
        ];
      } catch {
        return [sort];
      }
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(`${BASE_URL}/title/${titleId(manga.url)}`);
      const label = document.selectFirst('.detailTopBlock .number')?.text().trim().toLowerCase() ?? '';
      return {
        url: manga.url,
        title: document.selectFirst('.detailBlock h1')?.text() || manga.title,
        author: document
          .select('.detailBlock .authorName a')
          .map((a) => a.text())
          .join(', '),
        description: document.selectFirst('.titleInfo .storytext')?.text().trim() || undefined,
        genres: document.select('.titleInfo .infoList a[href*=genre]').map((a) => a.text()),
        status: label.startsWith('ongoing') ? 'ongoing' : label.startsWith('complete') ? 'completed' : 'unknown',
        thumbnailUrl: document.selectFirst('.detailBlock .thumBlock img')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const id = titleId(manga.url);
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED_PREF_KEY) ?? false;
      const first = await contentPage(id, 1);
      const lastPage = Math.max(
        1,
        ...html
          .load(first.html_page)
          .select('a[data-page]')
          .map((a) => Number.parseInt(a.attr('data-page') ?? '', 10) || 1),
      );
      const pages = [first];
      for (let p = 2; p <= lastPage; p++) pages.push(await contentPage(id, p));
      return pages.flatMap((page) =>
        html
          .load(page.html_content)
          .select('ul.detailBox > li:not(:has(.nextUpdateBlock))')
          .flatMap((li): Chapter[] => {
            const cid = (li.attr('id') ?? '').replace(/^_content_area_/, '');
            if (!cid) return [];
            const isLocked = !li.selectFirst('.btnBox a[href*=/reader/]:not([href*=/preview/])');
            if (hideLocked && isLocked) return [];
            const isPreview = isLocked && !!li.selectFirst('.btnBox a[href*=/preview/]');
            const prefix = !isLocked ? '' : isPreview ? '🔒 (Preview) ' : '🔒 ';
            return [
              {
                url: `/reader/${cid}${isPreview ? '/preview' : ''}`,
                name: prefix + (li.selectFirst('.titleName')?.text() ?? ''),
              },
            ];
          }),
      );
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const cid = chapter.url.split('/')[2] ?? '';
      const preview = chapter.url.endsWith('/preview');
      const url = `${READER_INFO_URL}?u0=${preview ? '1' : '0'}&u1=${encodeURIComponent(BASE_URL)}`;
      const pages = await fetchPages(url, cid, headers);
      if (pages.length === 0) throw new Error('Log in via WebView and purchase this chapter to read.');
      return pages;
    },
    transformImage: descramblePage,
    imageHeaders: () => ({ 'User-Agent': USER_AGENT }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?mangaplaza\.com\/title\/([^/?#]+)/i.exec(url.trim());
      return match ? { url: `/title/${match[1]}/`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
