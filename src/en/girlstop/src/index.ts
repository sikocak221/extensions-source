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
import { absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://en.girlstop.info';
const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  Referer: `${BASE_URL}/`,
};
const SORTS = [
  { label: '\u2500\u2500\u2500 POPULAR \u2500\u2500\u2500', value: 'filter.php?srt=viw' },
  { label: 'Popular: Week', value: 'filter.php?srt=viw' },
  { label: 'Popular: 2 Weeks', value: 'filter.php?srt=viw&week2' },
  { label: 'Popular: Month', value: 'filter.php?srt=viw&month' },
  { label: 'Popular: 3 Months', value: 'filter.php?srt=viw&month3' },
  { label: 'Popular: Half Year', value: 'filter.php?srt=viw&month6' },
  { label: '\u2500\u2500\u2500 BEST \u2500\u2500\u2500', value: 'filter.php?srt=pop' },
  { label: 'Best: Relevance', value: 'filter.php?srt=pop' },
  { label: 'Best: 2 Weeks', value: 'filter.php?srt=pop&week2' },
  { label: 'Best: Month', value: 'filter.php?srt=pop&month' },
  { label: 'Best: 3 Months', value: 'filter.php?srt=pop&month3' },
  { label: 'Best: Half Year', value: 'filter.php?srt=pop&month6' },
  { label: '\u2500\u2500\u2500 SANDBOX \u2500\u2500\u2500', value: 'index.php?new=d' },
  { label: 'Sandbox: New', value: 'index.php?new=d' },
  { label: 'Sandbox: Random All', value: 'filter.php?srt=promo' },
  { label: 'Sandbox: Random By New Authors', value: 'filter.php?srt=promonew' },
  { label: 'Sandbox: Best', value: 'filter.php?srt=dpop' },
  { label: '\u2500\u2500\u2500 POPULAR MODELS \u2500\u2500\u2500', value: 'models.php?popular' },
  { label: 'Models: Day', value: 'models.php?popular' },
  { label: 'Models: Week', value: 'models.php?popular&week' },
  { label: 'Models: Month', value: 'models.php?popular&month' },
  { label: 'Models: Favorites', value: 'models.php?popular&favorite' },
  { label: 'Models: Sets', value: 'models.php?popular&sets' },
];

async function load(url: string) {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return { url: response.url, document: html.load(response.body, { baseUrl: response.url }) };
}

function parseList(document: HtmlElement): MangaPage {
  const items = document.select('.thumbs .thumb').flatMap((thumb): MangaSummary[] => {
    const a = thumb.selectFirst('.post_title a');
    if (!a) return [];
    return [
      {
        url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
        title: a.text(),
        thumbnailUrl: thumb.selectFirst('picture img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('li.next a') != null };
}

// Page 1 has no page parameter; page n is "&page=n-1".
const paged = (path: string, page: number) =>
  page === 1 ? path : `${path}${path.includes('?') ? '&' : '?'}page=${page - 1}`;
const list = async (path: string, page: number) => parseList((await load(paged(path, page))).document);

function postDate(text?: string): number | undefined {
  const value = text?.toLowerCase() ?? '';
  if (!value) return undefined;
  if (/today|just now|recently/.test(value)) return Date.now();
  if (value.includes('yesterday')) return Date.now() - 86_400_000;
  return parseDate(text, 'd MMM yyyy');
}

const posts = (document: HtmlElement): Chapter[] =>
  document.select('.thumbs .thumb').flatMap((thumb): Chapter[] => {
    const a = thumb.selectFirst('.post_title a');
    if (!a) return [];
    const row = thumb.select('tr').find((tr) => tr.selectFirst('td')?.text().includes('Approved'));
    const cells = row?.select('td') ?? [];
    return [
      {
        url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
        name: a.text(),
        uploadedAt: postDate(cells[cells.length - 1]?.text()),
      },
    ];
  });

// Entries are galleries ("psto.php") or models ("models.php", whose galleries are the chapters).
export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list('/filter.php?srt=viw', page),
    getLatest: (page) => list('/index.php', page),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        const response = await http.post(`${BASE_URL}/models.php`, { form: { text: query.trim() } }, { headers });
        return parseList(html.load(response.body, { baseUrl: response.url }));
      }
      return list(`/${typeof filters.sort === 'string' && filters.sort ? filters.sort : 'filter.php?srt=viw'}`, page);
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Search query ignores filters' },
      { type: 'separator' },
      { type: 'select', id: 'sort', label: 'Sort by', options: SORTS },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { url, document } = await load(manga.url);
      if (url.includes('models.php')) {
        return {
          url: manga.url,
          title: (document.selectFirst('h1.index')?.text() ?? manga.title).replace(/ - nude galleries.*/, '').trim(),
          description: document.selectFirst('#modeldesc')?.text() || undefined,
          thumbnailUrl: document.selectFirst('.model-cover img')?.absUrl('src') || manga.thumbnailUrl,
          status: 'ongoing',
        };
      }
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        author: document.selectFirst(".ps-desc a[href*='user.php']")?.text(),
        genres: document.select('.ps-tags a').map((a) => a.text()),
        description:
          document
            .select('.ps-desc:not(.ps-tags)')
            .map((e) => e.text())
            .join('\n')
            .trim() || undefined,
        thumbnailUrl: document.selectFirst('.tiles-wrap img')?.absUrl('src') || manga.thumbnailUrl,
        status: 'completed',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      if (manga.url.includes('psto.php')) return [{ url: manga.url, name: 'Gallery', number: 1 }];
      let { url, document } = await load(manga.url);
      if (!url.includes('models.php')) return [{ url: manga.url, name: 'Gallery', number: 1 }];
      const chapters: Chapter[] = [];
      for (const seen = new Set<string>(); ;) {
        chapters.push(...posts(document));
        const next = document.selectFirst('li.next a')?.attr('href');
        if (!next || seen.has(next)) break;
        seen.add(next);
        ({ url, document } = await load(`/${next.replace(/^\//, '')}`));
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(chapter.url);
      return document
        .select('a.fullimg')
        .map((a, index) => ({ index, imageUrl: a.absUrl('href') || a.attr('href') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/(?:psto|models)\.php\?[^#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
