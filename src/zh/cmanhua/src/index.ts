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
import { USER_AGENT, absoluteUrl, hostOf, parseDate } from './common/utils';

const BASE_URL = 'https://cmanhua.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const SORTS: [string, string][] = [
  ['Update time', 'updated_desc'],
  ['Views', 'views_desc'],
  ['Bookmarks', 'bookmark_desc'],
  ['Number of chapters', 'chapter_desc'],
];
const STATUSES: [string, string][] = [
  ['All', ''],
  ['Ongoing', 'ongoing'],
  ['Completed', 'completed'],
  ['Hiatus', 'hiatus'],
];

const POSTBACK = /__doPostBack\('([^']+)'/;
const CHAPTER = /^\D*?(\d+(?:\.\d+)?)\s*:\s*(.*)$/;

async function load(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(url, { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

/** Listing pages are only reachable through ASP.NET postbacks from the previous page. */
async function postBack(page: { document: HtmlElement; url: string }, target: string) {
  const form = page.document.selectFirst('form#ctl01');
  if (!form) throw new Error('Form not found');
  const fields: Record<string, string> = { __EVENTTARGET: target };
  for (const input of form.select('input[name]')) {
    const name = input.attr('name') ?? '';
    const type = input.attr('type') ?? '';
    if (['submit', 'button', 'image', 'file'].includes(type) || name === '__EVENTTARGET') continue;
    if (type === 'checkbox' || type === 'radio') {
      if (input.attr('checked') !== undefined) fields[name] = input.attr('value') ?? '';
    } else fields[name] = input.attr('value') ?? '';
  }
  for (const select of form.select('select[name]')) {
    const option = select.selectFirst('option[selected]') ?? select.selectFirst('option');
    fields[select.attr('name') ?? ''] = option?.attr('value') ?? '';
  }
  const response = await http.post(form.absUrl('action') ?? page.url, { form: fields }, { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

function nextPageTarget(document: HtmlElement): string | undefined {
  const link = document.select('a[id^="MainContent_rptPager_lnkPage"]').find((a) => a.text() === '>');
  return link ? POSTBACK.exec(link.attr('href') ?? '')?.[1] : undefined;
}

let lastListing: { url: string; page: number; current: { document: HtmlElement; url: string } } | undefined;

const browseUrl = (sort: string, status: string) =>
  `${BASE_URL}/Browse?orderBy=${sort}${status ? `&status=${status}` : ''}`;

async function fetchMangaList(url: string, page: number): Promise<MangaPage> {
  const cached = lastListing && lastListing.url === url && lastListing.page <= page ? lastListing : undefined;
  let current = cached?.page ?? 1;
  let doc = cached?.current ?? (await load(url));
  while (current < page) {
    const target = nextPageTarget(doc.document);
    if (!target) return { items: [], hasNextPage: false };
    doc = await postBack(doc, target);
    current++;
  }
  lastListing = { url, page: current, current: doc };
  const items = doc.document.select('#browseSection a[href^="/comic/"]').map((element) => ({
    url: `/comic/${(element.absUrl('href') ?? '').replace(`${BASE_URL}/comic/`, '').split(/[/?#]/)[0] ?? ''}`,
    title: element.selectFirst('.comic-title')?.text() ?? '',
    thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
  }));
  return { items, hasNextPage: nextPageTarget(doc.document) !== undefined };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => fetchMangaList(browseUrl('views_desc', ''), page),
    getLatest: (page) => fetchMangaList(browseUrl('updated_desc', ''), page),
    async search(query, page, filters): Promise<MangaPage> {
      if (query.trim()) {
        const response = await http.get<{ slug: string; title: string; cover: string }[]>(
          `${BASE_URL}/Modules/Search/SearchHandler.ashx?q=${encodeURIComponent(query.trim())}`,
          { headers, responseType: 'json' },
        );
        return {
          items: response.body.map((item) => ({
            url: item.slug,
            title: item.title,
            thumbnailUrl: BASE_URL + item.cover,
          })),
          hasNextPage: false,
        };
      }
      const value = (id: string, fallback: string) =>
        typeof filters[id] === 'string' ? (filters[id] as string) : fallback;
      return fetchMangaList(browseUrl(value('sort', SORTS[0]![1]), value('status', '')), page);
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Filters are ignored when searching by name.' },
      {
        type: 'select',
        id: 'sort',
        label: 'Order by',
        options: SORTS.map(([label, value]) => ({ label, value })),
        default: SORTS[0]![1],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: STATUSES.map(([label, value]) => ({ label, value })),
        default: '',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(`${BASE_URL}${manga.url}`);
      const statusText = document.selectFirst('#MainContent_lblStatus')?.text().toLowerCase();
      const status: MangaStatus =
        statusText === 'ongoing'
          ? 'ongoing'
          : statusText === 'completed'
            ? 'completed'
            : statusText === 'hiatus'
              ? 'hiatus'
              : 'unknown';
      const other = document.selectFirst('#MainContent_lblOtherName')?.text();
      const description = [
        document.selectFirst('#MainContent_lblDescription')?.text() ?? '',
        other?.trim() ? `\n\nAlternative name: ${other}` : '',
      ].join('');
      return {
        url: manga.url,
        title: document.selectFirst('#MainContent_lblTitle')?.text() || manga.title,
        author: document.selectFirst('#MainContent_lblAuthor')?.text() || undefined,
        status,
        genres: document.select('.cd-tag').map((e) => e.text()),
        description: description || undefined,
        thumbnailUrl: document.selectFirst('#MainContent_imgCover')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const first = await load(`${BASE_URL}${manga.url}`);
      const targets = first.document
        .select('#MainContent_ctl12 a[href*="rptChapterRanges"]:not(.btn-primary)')
        .map((a) => POSTBACK.exec(a.attr('href') ?? '')?.[1])
        .filter((t): t is string => Boolean(t));
      const pages = [first];
      for (const target of targets) pages.push(await postBack(first, target));
      const seen = new Set<string>();
      const chapters: Chapter[] = [];
      for (const { document } of pages) {
        for (const element of document.select('li.cd-chapter-item')) {
          const link = element.selectFirst('a.cd-chapter-link');
          const id = /[?&]id=([^&]+)/.exec(link?.absUrl('href') ?? '')?.[1];
          if (!link || !id || seen.has(id)) continue;
          seen.add(id);
          const match = CHAPTER.exec(link.text());
          chapters.push({
            url: `/ReadComic?id=${id}`,
            name: match ? `Chapter ${match[1]}: ${match[2]}` : link.text(),
            number: match ? Number.parseFloat(match[1]!) : -1,
            uploadedAt: parseDate(element.selectFirst('span.small')?.text(), 'dd/MM/yyyy'),
          });
        }
      }
      return chapters.reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(`${BASE_URL}${chapter.url}`);
      return document
        .select('img.chapter-image')
        .map((img, index) => ({ index, imageUrl: img.absUrl('data-src') || img.absUrl('src') || '' }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)\/comic\/([^/?#]+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: `/comic/${match[2]}`, title: '' };
    },
  }),
});
