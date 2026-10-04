import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, ownText, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://www.11toon.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const SORTS = [
  { value: '/bbs/board.php?bo_table=toon_c', label: '인기만화' },
  { value: '/bbs/board.php?bo_table=toon_c&tablename=최신만화&type=upd', label: '최신만화' },
];
const STATUSES = [
  { value: '0', label: '전체' },
  { value: '1', label: '완결' },
];
const GENRES = [
  '전체',
  ...'SF 무협 TS 개그 드라마 러브코미디 먹방 백합 붕탁 스릴러 스포츠 시대 액션 순정 일상+치유 추리 판타지 학원 호러 BL 17 이세계 전생 라노벨 애니화 TL'.split(
    ' ',
  ),
].map((label) => ({ value: label === '전체' ? '' : label, label }));

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const thumbnailFromStyle = (element: HtmlElement) => {
  const thumb = element.selectFirst('.homelist-thumb');
  const style = thumb?.attr('style');
  return thumb && style ? `https:${style.split("url('")[1]?.split("')")[0] ?? ''}` : undefined;
};

function hasNextPage(document: HtmlElement): boolean {
  return document.selectFirst('.pg_end') !== null;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page): Promise<MangaPage> {
      const document = await load(
        withQuery('/bbs/board.php?bo_table=toon_c&is_over=0', { page: page > 1 ? String(page) : undefined }),
      );
      const items = document.select('li[data-id]').flatMap((li): MangaSummary[] => {
        const href = li.selectFirst('a')?.absUrl('href');
        const title = li.selectFirst('.homelist-title')?.text();
        if (!href || !title) return [];
        return [
          {
            url: relativeUrl(href),
            title,
            thumbnailUrl: li.selectFirst('.homelist-thumb')?.absUrl('data-mobile-image') || undefined,
          },
        ];
      });
      return { items, hasNextPage: hasNextPage(document) };
    },
    async getLatest(page): Promise<MangaPage> {
      const document = await load(`/bbs/board.php?bo_table=toon_c&sord=&type=upd&page=${page}`);
      const items = document.select('li[data-id]').flatMap((li): MangaSummary[] => {
        const href = li.selectFirst('a')?.absUrl('href');
        const title = li.selectFirst('.homelist-title')?.text();
        if (!href || !title) return [];
        return [{ url: relativeUrl(href), title, thumbnailUrl: thumbnailFromStyle(li) }];
      });
      return { items, hasNextPage: hasNextPage(document) };
    },
    getFilters: (): Filter[] => [
      {
        type: 'header',
        label: "Note: can't combine search query with filters, status filter only has effect in 인기만화",
      },
      { type: 'separator' },
      { type: 'select', id: 'sort', label: 'Sort', options: SORTS },
      { type: 'select', id: 'status', label: 'Status', options: STATUSES },
      { type: 'select', id: 'genre', label: 'Genre', options: GENRES },
    ],
    async search(query, page, filters): Promise<MangaPage> {
      let url: string;
      if (query.trim()) {
        url = withQuery('/bbs/search_stx.php', { stx: query });
      } else {
        const sort = typeof filters.sort === 'string' ? filters.sort : SORTS[0]!.value;
        const genre = typeof filters.genre === 'string' ? filters.genre : '';
        url = withQuery(sort, {
          is_over: typeof filters.status === 'string' ? filters.status : '',
          page: page > 1 ? String(page) : undefined,
          sca: genre || undefined,
        });
      }
      const document = await load(url);
      const items = document.select('li[data-id]').flatMap((li): MangaSummary[] => {
        const title = li.selectFirst('.homelist-title')?.text();
        if (!title) return [];
        return [
          {
            url: `/bbs/board.php?bo_table=toons&stx=${encodeURIComponent(title)}&is=${li.attr('data-id')}`,
            title,
            thumbnailUrl: thumbnailFromStyle(li),
          },
        ];
      });
      return { items, hasNextPage: hasNextPage(document) };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const field = (label: string) => document.selectFirst(`span:contains(${label}) + span`)?.text();
      const statusText = field('분류') ?? '';
      const status: MangaStatus = statusText.includes('완결')
        ? 'completed'
        : ['주간', '월간', '연재', '격주'].some((s) => statusText.includes(s))
          ? 'ongoing'
          : 'unknown';
      return {
        url: manga.url,
        title: document.selectFirst('h2.title')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('img.banner')?.absUrl('src') || manga.thumbnailUrl,
        status,
        author: field('작가'),
        description: field('소개'),
        genres: field('장르')
          ?.split(',')
          .map((g) => g.trim()),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      let document = await load(manga.url);
      const chapters: Chapter[] = [];
      const collect = (doc: HtmlElement) => {
        for (const li of doc.select('#comic-episode-list > li')) {
          const button = li.selectFirst('button');
          const url = button?.attr('onclick')?.split("location.href='.")[1]?.split("'")[0];
          const name = button?.selectFirst('.episode-title')?.text();
          if (!url || !name) continue;
          chapters.push({ url, name, uploadedAt: parseDate(ownText(li.selectFirst('.free-date')), 'yy.MM.dd') });
        }
      };
      collect(document);
      if (document.selectFirst('span.pg')) {
        let next = document.selectFirst('.pg_current ~ .pg_page')?.absUrl('href');
        while (next) {
          document = await load(next);
          collect(document);
          next = document.selectFirst('.pg_current ~ .pg_page')?.absUrl('href');
        }
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(`${BASE_URL}/bbs${chapter.url}`, { headers });
      const list = /img_list\s*=\s*(\[[\s\S]*?\])/.exec(response.body)?.[1];
      const images = list ? (JSON.parse(list) as string[]) : [];
      return images.map((img, index) => ({ index, imageUrl: `https:${img}` }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/bbs\/board\.php\?bo_table=toons&[^#]*)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) =>
      item.url.startsWith('/bbs/') ? absoluteUrl(BASE_URL, item.url) : `${BASE_URL}/bbs${item.url}`,
  }),
});
