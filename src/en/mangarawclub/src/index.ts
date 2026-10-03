import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, ownText, relativeUrl } from './common/utils';

const BASE_URL = 'https://www.mgeko.cc';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const HIDE_NSFW_PREFERENCE: Preference = {
  type: 'switch',
  key: 'pref_hide_nsfw',
  label: 'Hide NSFW entries',
  default: false,
};

const GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Cooking',
  'Manga',
  'Drama',
  'Fantasy',
  'Gender bender',
  'Harem',
  'Historical',
  'Horror',
  'Isekai',
  'Josei',
  'Manhua',
  'Manhwa',
  'Martial arts',
  'Mature',
  'Mecha',
  'Medical',
  'Mystery',
  'One shot',
  'Psychological',
  'Romance',
  'School life',
  'Sci fi',
  'Seinen',
  'Shoujo',
  'Shounen',
  'Slice of life',
  'Sports',
  'Supernatural',
  'Tragedy',
  'Webtoons',
  'Ladies',
];

const SORTS: [string, string][] = [
  ['New', 'recently_added'],
  ['Updated', 'latest'],
  ['Popular (Daily)', 'popular_daily'],
  ['Popular (Weekly)', 'popular_weekly'],
  ['Popular (Monthly)', 'popular_monthly'],
  ['Popular (All Time)', 'popular_all_time'],
  ['Rating', 'rating'],
  ['Title (A-Z)', 'az'],
  ['Title (Z-A)', 'za'],
];

const EXTRAS: [string, string][] = [
  ['only_completed', 'Only completed series'],
  ['only_translated', 'At least 50+ chapters translated'],
  ['hide_on_break', 'Hide long hiatus (> 6 months)'],
];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const safeMode = () => (prefs.get<boolean>(HIDE_NSFW_PREFERENCE.key) ? '1' : '0');

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const cover = (img: HtmlElement | null) => (img ? img.absUrl('data-src') || img.absUrl('src') || undefined : undefined);

async function browse(params: string[]): Promise<MangaPage> {
  const response = await http.get(`${BASE_URL}/browse-comics/data/?${params.join('&')}`, { headers });
  const data = JSON.parse(response.body) as { results_html: string; page: number; num_pages: number };
  const document = html.load(data.results_html, { baseUrl: BASE_URL });
  const items = document.select('.comic-card').flatMap((card): MangaSummary[] => {
    const link = card.selectFirst('a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: card.selectFirst('.comic-card__title a')?.text() ?? '',
        thumbnailUrl: cover(card.selectFirst('.comic-card__cover img')),
      },
    ];
  });
  return { items, hasNextPage: data.page < data.num_pages };
}

const text = (filters: FilterState, id: string) =>
  typeof filters[id] === 'string' ? (filters[id] as string).trim() : '';

function isDefault(filters: FilterState): boolean {
  return Object.entries(filters).every(([id, value]) => {
    if (id === 'sort') return value === 'latest' || value === undefined;
    return value === '' || value === false || value === undefined || value === null || value === 'ignore';
  });
}

// The site uses AP style months ("Sept.", "March") and optional minutes ("3 p.m.").
function chapterDate(raw: string | undefined): number | undefined {
  const match = /^([A-Za-z]+)\.?\s+(\d+),\s*(\d{4}),\s*(\d+)(?::(\d+))?\s*([ap])\.?m/i.exec(raw?.trim() ?? '');
  if (!match) return undefined;
  const month = MONTHS.indexOf(match[1]!.slice(0, 3).toLowerCase());
  if (month < 0) return undefined;
  const hour = (Number(match[4]) % 12) + (match[6]!.toLowerCase() === 'p' ? 12 : 0);
  return new Date(Number(match[3]), month, Number(match[2]), hour, Number(match[5] ?? 0)).getTime();
}

function altNames(raw: string | undefined): string[] {
  if (!raw) return [];
  const separator = /[•;]/.test(raw) ? /[•;]/ : /,/;
  return raw
    .split(separator)
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== 'updating');
}

export default defineExtension({
  preferences: () => [HIDE_NSFW_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => browse([`page=${page}`, 'sort=popular_all_time', `safe_mode=${safeMode()}`]),
    getLatest: (page) => browse([`page=${page}`, 'sort=latest', `safe_mode=${safeMode()}`]),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      // A plain text search goes to the site's quick search.
      if (query.trim() && isDefault(filters)) {
        const document = await load(`/search/?search=${encodeURIComponent(query.trim())}&results=${page}`);
        const items = document.select('.novel-item').flatMap((el): MangaSummary[] => {
          const link = el.selectFirst('a');
          if (!link) return [];
          return [
            {
              url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
              title: el.selectFirst('.novel-title')?.text() ?? '',
              thumbnailUrl: cover(el.selectFirst('.novel-cover img')),
            },
          ];
        });
        return { items, hasNextPage: document.selectFirst('nav.paging a:contains(Next)') != null };
      }
      const params = [`sort=${text(filters, 'sort') || 'latest'}`];
      for (const id of ['status', 'type']) params.push(`${id}=${encodeURIComponent(text(filters, id))}`);
      if (text(filters, 'min_chapters'))
        params.push(`min_chapters=${encodeURIComponent(text(filters, 'min_chapters'))}`);
      if (text(filters, 'max_chapters'))
        params.push(`max_chapters=${encodeURIComponent(text(filters, 'max_chapters'))}`);
      if (text(filters, 'rating'))
        params.push(`min_rating=${Math.trunc((Number.parseFloat(text(filters, 'rating')) || 0) * 10)}`);
      for (const [id] of EXTRAS) if (filters[`extra.${id}`] === true) params.push(`${id}=1`);
      params.push(`safe_mode=${safeMode()}`, `page=${page}`);
      const include = GENRES.filter((g) => filters[`genre.${g}`] === 'include');
      const exclude = GENRES.filter((g) => filters[`genre.${g}`] === 'exclude');
      if (include.length) params.push(`include_genres=${encodeURIComponent(include.join(','))}`);
      if (exclude.length) params.push(`exclude_genres=${encodeURIComponent(exclude.join(','))}`);
      const tags = text(filters, 'tags')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length) params.push(`tags=${encodeURIComponent(tags.join(','))}`);
      params.push(`q=${encodeURIComponent(query.trim())}`);
      return browse(params);
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: 'Sort by',
        options: SORTS.map(([label, value]) => ({ label, value })),
        default: 'latest',
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: ['Any', 'Ongoing', 'Completed', 'Hiatus'].map((s) => ({ label: s, value: s === 'Any' ? '' : s })),
        default: '',
      },
      {
        type: 'select',
        id: 'type',
        label: 'Types',
        options: ['Any', 'Manga', 'Manhwa', 'Manhua', 'Webtoon'].map((s) => ({
          label: s,
          value: s === 'Any' ? '' : s,
        })),
        default: '',
      },
      {
        type: 'group',
        id: 'genre',
        label: 'Genre',
        filters: GENRES.map((g) => ({ type: 'tristate', id: `genre.${g}`, label: g })),
      },
      { type: 'separator' },
      { type: 'header', label: 'Separate tags with commas (,)' },
      { type: 'text', id: 'tags', label: 'Tags' },
      { type: 'separator' },
      { type: 'text', id: 'min_chapters', label: 'Minimum Chapter' },
      { type: 'text', id: 'max_chapters', label: 'Maximum Chapter' },
      { type: 'separator' },
      { type: 'text', id: 'rating', label: 'Minimum Rating (e.g.: 1.1, 5.0)' },
      { type: 'separator' },
      {
        type: 'group',
        id: 'extra',
        label: 'Extras',
        filters: EXTRAS.map(([id, label]) => ({ type: 'checkbox', id: `extra.${id}`, label })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      if (!document.selectFirst('.novel-header')) throw new Error('Page not found');
      const author = document.selectFirst('.author a')?.attr('title')?.trim();
      const summary = document.selectFirst('.description')?.text().split('Summary is').slice(1).join('Summary is');
      const alt = document.selectFirst('.alternative-title');
      const names = altNames(alt ? ownText(alt) : undefined);
      const description = [
        ...(summary?.trim() ? [summary.trim()] : []),
        ...(names.length ? [`Alternative Names:${names.map((n) => `\n- ${n}`).join('')}`] : []),
      ].join('\n\n');
      return {
        url: manga.url,
        title: document.selectFirst('.novel-title')?.text() || manga.title,
        author: author && author.toLowerCase() !== 'updating' ? author : undefined,
        description: description || undefined,
        genres: document.select('.categories a[href*=genre]').map((a) =>
          ownText(a)
            .split(' ')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' '),
        ),
        status: document.selectFirst('div.header-stats strong.completed')
          ? 'completed'
          : document.selectFirst('div.header-stats strong.ongoing')
            ? 'ongoing'
            : 'unknown',
        thumbnailUrl: cover(document.selectFirst('.cover img')) ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(`${manga.url.replace(/\/?$/, '/')}all-chapters/`);
      return document.select('ul.chapter-list > li').flatMap((li): Chapter[] => {
        const link = li.selectFirst('a');
        const title = li.selectFirst('.chapter-title, .chapter-number');
        if (!link || !title) return [];
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            name: `Chapter ${ownText(title).replace(/-eng-li$/, '')}`,
            uploadedAt: chapterDate(li.selectFirst('.chapter-update')?.attr('datetime')?.replace('Sept', 'Sep')),
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('#chapter-reader img')
        .map((img) => img.absUrl('src') || img.attr('src') || '')
        .filter((src) => src && !src.includes('credits-mgeko.png'))
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+\/)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL).replace(/^www\./, '')
        ? { url: match[2]!, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
