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
import { USER_AGENT, hostOf, ownText, parseDate } from './common/utils';
import { decodeEucKr, encodeEucKr } from './euckr';

// The site rotates its domain (wfwf507.com → wfwf510.com …): the old one answers a notice page whose
// `a.main-btn` points to the new one, which load() follows.
const BASE_URL = 'https://wfwf510.com';
let base = BASE_URL;

// The photo section (포토툰) of the Tachiyomi extension is gone from the site.
type Kind = 'webtoon' | 'comic';

const SORT_PARAM = 'o';
const ROW_PARAMS = ['t1', 't2', 't3'];
const ROW_NAMES: Record<string, string> = { t1: '요일', t2: '분류', t3: '장르' };

const headers = () => ({ 'User-Agent': USER_AGENT, Referer: `${base}/` });

async function load(path: string): Promise<HtmlElement> {
  for (let hops = 0; ; hops++) {
    const response = await http.get<string>(`${base}${path}`, { headers: headers(), responseType: 'bytes' });
    const bytes = base64.decodeBytes(response.body);
    const charset = response.headers['content-type'] ?? '';
    const body = /utf-?8/i.test(charset) ? utf8.decode(Array.from(bytes)) : decodeEucKr(bytes);
    const document = html.load(body, { baseUrl: response.url });
    const moved = document.selectFirst('a.main-btn')?.attr('href');
    if (moved && hops < 3 && hostOf(moved) && hostOf(moved) !== hostOf(base)) {
      base = moved.replace(/\/+$/, '');
      continue;
    }
    return document;
  }
}

const queryParam = (href: string, name: string) => {
  const raw = new RegExp(`[?&]${name}=([^&#]*)`).exec(href)?.[1] ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const hasNextPage = (document: HtmlElement) => document.selectFirst('.pagi .pg-btn.on + a.pg-btn') !== null;

export default defineExtension({
  createSource: (info) => {
    const kind = info.key as Kind;
    const browsePath = kind === 'comic' ? 'cm' : 'ing';
    const entryPath = kind === 'comic' ? 'cl' : 'list';
    const readerPath = kind === 'comic' ? 'cv' : 'view';
    const sortOptions =
      kind === 'comic'
        ? [
            { value: 'n', label: '최신순' },
            { value: 'f', label: '인기순' },
          ]
        : [
            { value: 'n', label: '최신순' },
            { value: 'r', label: '신작순' },
            { value: 'f', label: '인기순' },
          ];

    async function browse(page: number, query: string, filters: FilterState, sort?: string): Promise<MangaPage> {
      let path: string;
      if (query.trim()) {
        if (query.trim().length < 2) throw new Error('두 글자 이상 입력 해주세요.');
        path = `/sh?q=${encodeEucKr(query.trim())}&pg=${page}`;
      } else {
        const ended = kind === 'webtoon' && filters.status === 'end';
        const params = [`${SORT_PARAM}=${sort ?? (typeof filters.sort === 'string' ? filters.sort : 'n')}`];
        for (const param of ROW_PARAMS) {
          const value = filters[param];
          if (typeof value === 'string' && value) params.push(`${param}=${encodeEucKr(value)}`);
        }
        path = `/${ended ? 'end' : browsePath}?${params.join('&')}&pg=${page}`;
      }
      const document = await load(path);
      const items = document.select(`a.t-card[href*="/${entryPath}?"]`).flatMap((card): MangaSummary[] => {
        const id = queryParam(card.attr('href') ?? '', 'toon');
        const title = card.selectFirst('.t-title')?.text();
        if (!id || !title) return [];
        return [
          {
            url: `/${entryPath}?toon=${id}`,
            title,
            thumbnailUrl: card.selectFirst('.t-img img')?.absUrl('src') || undefined,
          },
        ];
      });
      return { items, hasNextPage: hasNextPage(document) };
    }

    return {
      baseUrl: BASE_URL,
      getPopular: (page) => browse(page, '', {}, 'f'),
      getLatest: (page) => browse(page, '', {}, 'n'),
      search: (query, page, filters) => browse(page, query, filters),
      async getFilters(): Promise<Filter[]> {
        const filters: Filter[] = [
          { type: 'header', label: '검색어 입력 시 필터는 무시됩니다' },
          { type: 'select', id: 'sort', label: '정렬 기준', options: sortOptions, default: 'n' },
        ];
        if (kind === 'webtoon')
          filters.push({
            type: 'select',
            id: 'status',
            label: '상태',
            options: [
              { value: 'ing', label: '연재' },
              { value: 'end', label: '완결' },
            ],
            default: 'ing',
          });
        try {
          const document = await load(`/${browsePath}`);
          for (const row of document.select('.f-row')) {
            const links = row.select('a.ftag').map((a) => ({ name: ownText(a), href: a.attr('href') ?? '' }));
            const param = ROW_PARAMS.find((p) => links.some((l) => queryParam(l.href, p)));
            if (!param) continue;
            filters.push({
              type: 'select',
              id: param,
              label: ROW_NAMES[param] ?? param,
              options: links.map((l) => ({ value: queryParam(l.href, param), label: l.name })),
            });
          }
        } catch {
          // The static filters still work without the site's own rows.
        }
        return filters;
      },
      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const document = await load(manga.url);
        const genres = document.select('.genre-tags a.gtag').map((a) => a.text().replace(/^#/, ''));
        return {
          url: manga.url,
          title: document.selectFirst('h1.w-title')?.text() || manga.title,
          thumbnailUrl: document.selectFirst('.thumb-wrap img')?.absUrl('src') || manga.thumbnailUrl,
          description: document.selectFirst('.summary')?.text() || undefined,
          genres: genres.length ? genres : undefined,
          status: 'unknown',
        };
      },
      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const chapters: Chapter[] = [];
        let document = await load(manga.url);
        for (let page = 1; ; page++) {
          for (const item of document.select('a.ep-item')) {
            const href = item.attr('href') ?? '';
            const toon = queryParam(href, 'toon');
            const num = queryParam(href, 'num');
            const name = item.selectFirst('.ep-title')?.text();
            if (!toon || !num || !name) continue;
            chapters.push({
              url: `/${readerPath}?toon=${toon}&num=${num}`,
              name,
              uploadedAt: parseDate(item.selectFirst('.ep-date')?.text(), 'yyyy-MM-dd'),
            });
          }
          if (!hasNextPage(document)) break;
          document = await load(`${manga.url}&s=n&pg=${page + 1}`);
        }
        return chapters;
      },
      async getPages(chapter: Chapter): Promise<Page[]> {
        const document = await load(chapter.url);
        return document
          .select('#vimg-area img[data-src]')
          .map((img, index) => ({ index, imageUrl: img.absUrl('data-src') || img.attr('data-src') || '' }));
      },
      imageHeaders: headers,
      resolveUrl(url: string): MangaSummary | null {
        const match = /^https?:\/\/(wfwf\d+\.com)\/(list|cl|view|cv)\?(?:[^#]*&)?toon=(\d+)/i.exec(url.trim());
        if (!match) return null;
        const comic = match[2] === 'cl' || match[2] === 'cv';
        if (comic !== (kind === 'comic')) return null;
        return { url: `/${entryPath}?toon=${match[3]}`, title: '' };
      },
      getWebUrl: (item) => `${base}${item.url}`,
    };
  },
});
