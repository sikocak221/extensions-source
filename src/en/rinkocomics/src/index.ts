import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://rinkocomics.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const LOCK_PREFIX = '🔒 ';
const LOCK_SUFFIX = '#lock';
const CHAPTERS_PER_PAGE = 10;

const HIDE_LOCKED_PREFERENCE: Preference = {
  type: 'switch',
  key: 'hide_paid_chapters',
  label: 'Hide paid chapters',
  default: false,
};

const GENRES: [string, string][] = [
  ['Action', 'action'],
  ['Adventure', 'adventure'],
  ['Comedy', 'comedy'],
  ['Drama', 'drama'],
  ['Family', 'family'],
  ['Fantasy', 'fantasy'],
  ['Historical', 'historical'],
  ['Horror', 'horror'],
  ['Isekai', 'isekai'],
  ['Josei', 'josei'],
  ['Magic', 'magic'],
  ['Mystery', 'mystery'],
  ['Parenthood', 'parenthood'],
  ['Reincarnation', 'reincarnation'],
  ['Revenge', 'revenge'],
  ['Romance', 'romance'],
  ['School Life', 'school-life'],
  ['Shoujo', 'shoujo'],
  ['Slice of Life', 'slice-of-life'],
  ['Sports', 'sports'],
  ['Supernatural', 'supernatural'],
  ['Survival Game', 'survival-game'],
  ['Tragedy', 'tragedy'],
];

const SORTS: [string, string][] = [
  ['Newest First', 'newest'],
  ['Oldest First', 'oldest'],
  ['A-Z', 'az'],
  ['Z-A', 'za'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function image(img: HtmlElement | null): string | undefined {
  if (!img) return undefined;
  for (const name of ['data-src', 'data-lazy-src', 'src']) {
    if (img.attr(name) !== undefined) return (img.absUrl(name) || img.attr(name) || '').trim() || undefined;
  }
  return undefined;
}

const comicsUrl = (page: number) => (page <= 1 ? '/comic/' : `/comic/page/${page}/`);

async function comicsPage(url: string): Promise<MangaPage> {
  const document = await load(url);
  const items = document.select('article.ac-card').flatMap((card): MangaSummary[] => {
    const link = card.selectFirst('.ac-title a');
    const href = link?.absUrl('href')?.trim();
    if (!link || !href) return [];
    return [
      { url: relativeUrl(href), title: link.text().trim(), thumbnailUrl: image(card.selectFirst('.ac-thumb img')) },
    ];
  });
  return { items, hasNextPage: document.selectFirst('.ac-pagination a.next') != null };
}

function isLocked(el: HtmlElement): boolean {
  const reason = (el.attr('data-reason') ?? '').toLowerCase();
  if (reason && reason !== 'free') return true;
  if ((el.attr('class') ?? '').split(/\s+/).includes('locked-chapter')) return true;
  const href = el.selectFirst('a')?.attr('href') ?? '';
  return !href || href === '#' || el.selectFirst('.chapter_price') != null;
}

function parseChapters(elements: HtmlElement[], hideLocked: boolean): Chapter[] {
  return elements.flatMap((el): Chapter[] => {
    const url = el.attr('data-permalink')?.trim() || el.selectFirst('a')?.absUrl('href') || '';
    if (!url) return [];
    const locked = isLocked(el);
    if (locked && hideLocked) return [];
    const name = (el.selectFirst('.chapter-number')?.text() ?? el.attr('data-title') ?? '').trim();
    return [
      {
        url: relativeUrl(url) + (locked ? LOCK_SUFFIX : ''),
        name: (locked ? LOCK_PREFIX : '') + name,
        uploadedAt: parseDate(el.selectFirst('.chapter-date')?.text(), 'MMMM d, yyyy'),
      },
    ];
  });
}

function status(text: string | undefined): MangaStatus {
  switch (text?.trim().toLowerCase()) {
    case 'ongoing':
      return 'ongoing';
    case 'completed':
      return 'completed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const document = await load('/');
      const items = document.select('.comics-flex-pinned a.pinned-comic-card').flatMap((card): MangaSummary[] => {
        const href = card.absUrl('href')?.trim();
        const title = card.selectFirst('.pinned-comic-title')?.text().trim();
        if (!href || !title) return [];
        return [{ url: relativeUrl(href), title, thumbnailUrl: image(card.selectFirst('.comic-thumbnail img')) }];
      });
      return { items, hasNextPage: false };
    },
    getLatest: (page) => comicsPage(`${comicsUrl(page)}?sort=newest`),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = ['post_type=comic'];
      if (query.trim()) params.push(`s=${encodeURIComponent(query.trim())}`);
      for (const [, slug] of GENRES) if (filters[`genre.${slug}`] === true) params.push(`genres[]=${slug}`);
      params.push(`sort=${typeof filters.sort === 'string' ? filters.sort : 'newest'}`);
      return comicsPage(`${comicsUrl(page)}?${params.join('&')}`);
    },
    getFilters: (): Filter[] => [
      {
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: GENRES.map(([label, slug]) => ({ type: 'checkbox', id: `genre.${slug}`, label })),
      },
      {
        type: 'select',
        id: 'sort',
        label: 'Sort',
        options: SORTS.map(([label, value]) => ({ label, value })),
        default: 'newest',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const people = [
        ...new Set(
          document
            .select('.comic-graph > span')
            .map((s) => s.text())
            .filter((t) => t.trim() && t !== '•'),
        ),
      ];
      return {
        url: manga.url,
        title:
          (document.selectFirst('.comic-info-upper h1') ?? document.selectFirst('h1'))?.text().trim() || manga.title,
        thumbnailUrl: document.selectFirst('meta[property=og:image]')?.attr('content') || manga.thumbnailUrl,
        author: people[0],
        artist: people[1],
        status: status(document.selectFirst('.comic-status span:last-child')?.text()),
        genres: document.select('.comic-genres .genres .genre').map((g) => g.text()),
        description: document.selectFirst('.comic-synopsis')?.text().trim() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED_PREFERENCE.key) ?? false;
      const document = await load(manga.url);
      const chapters = new Map<string, Chapter>();
      const add = (items: Chapter[]) => {
        for (const c of items) if (!chapters.has(c.url)) chapters.set(c.url, c);
      };
      add(parseChapters(document.select('li.chapter'), hideLocked));
      const button = document.selectFirst('#loadMoreChaptersBtn');
      const comicId = button?.attr('data-comic-id') ?? '';
      const nonce = /comicworld_ajax\s*=\s*\{[^}]*"nonce"\s*:\s*"([^"]+)"/.exec(document.html())?.[1] ?? '';
      let offset = Number(button?.attr('data-offset')) || 0;
      if (offset <= 0 || (chapters.size > 0 && offset > chapters.size)) offset = chapters.size;
      while (comicId && nonce) {
        const response = await http.post(
          `${BASE_URL}/wp-admin/admin-ajax.php`,
          { form: { action: 'load_more_chapters', nonce, comic_id: comicId, offset: String(offset) } },
          { headers: { ...headers, 'X-Requested-With': 'XMLHttpRequest' } },
        );
        const result = JSON.parse(response.body) as { success?: boolean; data?: { html?: string } };
        const fragment = result.success ? (result.data?.html ?? '') : '';
        if (!fragment.trim()) break;
        const items = parseChapters(html.load(fragment, { baseUrl: BASE_URL }).select('li.chapter'), hideLocked);
        if (items.length === 0) break;
        add(items);
        offset += CHAPTERS_PER_PAGE;
      }
      return [...chapters.values()];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      if (chapter.url.includes(LOCK_SUFFIX)) throw new Error('This chapter is locked. Use WebView to purchase it.');
      const pages = (await load(chapter.url))
        .select('img.chapter-image')
        .map((img) => (img.absUrl('data-src') || img.absUrl('src') || '').trim())
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
      if (pages.length === 0) throw new Error('Chapter is locked or unavailable.');
      return pages;
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/comic\/[^/?#]+\/?)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) && !/\/comic\/page\/?$/.test(match[2]!)
        ? { url: match[2]!, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url.replace(LOCK_SUFFIX, '')),
  }),
});
