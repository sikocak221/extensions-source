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
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://themanga.site';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function mangaList(document: HtmlElement): MangaPage {
  const items = document.select('a.card, a.manga-card').flatMap((element): MangaSummary[] => {
    const title = element.selectFirst('.card-title')?.text();
    if (!title) return [];
    return [
      {
        url: relativeUrl(element.attr('href') ?? ''),
        title,
        thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('.explore-pagination__btn[rel=next], a[rel=next]') != null };
}

/** Value of a ".meta-item" by its exact label. */
function meta(document: HtmlElement, label: string): string | undefined {
  // The value is the label's next sibling: find it through their shared parent.
  const parent = document
    .select('*:has(> .meta-item-label)')
    .find((p) => p.selectFirst(':scope > .meta-item-label')?.text().trim() === label);
  return parent?.selectFirst(':scope > .meta-item-value')?.text() || undefined;
}

const option = (label: string, value: string) => ({ label, value });
const GENRES: [string, string][] = [["4-Koma", "4-koma"],["Action", "action"],["Adult", "adult"],["Adventure", "adventure"],["Aliens", "aliens"],["Animals", "animals"],["Anthology", "anthology"],["Comedy", "comedy"],["Cooking", "cooking"],["Crime", "crime"],["Crossdressing", "crossdressing"],["Delinquents", "delinquents"],["Demon", "demon"],["Demons", "demons"],["Drama", "drama"],["Ecchi", "ecchi"],["Fantasy", "fantasy"],["Game", "game"],["Gender Bender", "gender-bender"],["Genderswap", "genderswap"],["Ghosts", "ghosts"],["Gore", "gore"],["Gyaru", "gyaru"],["Harem", "harem"],["Historical", "historical"],["Horror", "horror"],["Incest", "incest"],["Isekai", "isekai"],["Josei", "josei"],["Loli", "loli"],["Mafia", "mafia"],["Magic", "magic"],["Magical Girls", "magical-girls"],["Martial Art", "martial-art"],["Martial Arts", "martial-arts"],["Mature", "mature"],["Mecha", "mecha"],["Medical", "medical"],["Military", "military"],["Monster", "monster"],["Monster Girls", "monster-girls"],["Monsters", "monsters"],["Music", "music"],["Mystery", "mystery"],["Ninja", "ninja"],["Office Workers", "office-workers"],["Oneshot", "oneshot"],["Philosophical", "philosophical"],["Police", "police"],["Psychological", "psychological"],["Regression", "regression"],["Reincarnation", "reincarnation"],["Reverse Harem", "reverse-harem"],["Romance", "romance"],["Samurai", "samurai"],["School", "school"],["School Life", "school-life"],["Sci-Fi", "sci-fi"],["Seinen", "seinen"],["Sexual Violence", "sexual-violence"],["Shotacon", "shotacon"],["Shoujo", "shoujo"],["Shoujo Ai", "shoujo-ai"],["Shounen", "shounen"],["Slice of Life", "slice-of-life"],["Smut", "smut"],["Sports", "sports"],["Super Power", "super-power"],["Supernatural", "supernatural"],["Survival", "survival"],["Suspense", "suspense"],["System", "system"],["Thriller", "thriller"],["Time Travel", "time-travel"],["Tragedy", "tragedy"],["Urban", "urban"],["Vampire", "vampire"],["Video Games", "video-games"],["Villainess", "villainess"],["Virtual Reality", "virtual-reality"],["Web Comic", "web-comic"],["Webtoons", "webtoons"],["Yuri", "yuri"],["Zombies", "zombies"],]; // prettier-ignore
const TEXT_FILTERS: [string, string][] = [
  ['rating_min', 'Minimum Rating'],
  ['year', 'Year'],
  ['author', 'Author'],
  ['artist', 'Artist'],
  ['type', 'Type'],
];

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: async (page) => mangaList(await fetchDocument(`${BASE_URL}/?q=&sort=popular&page=${page}`)),

    getLatest: async (page) => mangaList(await fetchDocument(`${BASE_URL}/?q=&sort=latest_update&page=${page}`)),

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const params: Record<string, string | undefined> = { q: query.trim(), page: String(page) };
      for (const id of ['status', 'genre', ...TEXT_FILTERS.map(([key]) => key)]) {
        const value = state[id];
        if (typeof value === 'string' && value.trim()) params[id] = value.trim();
      }
      return mangaList(await fetchDocument(withQuery(`${BASE_URL}/explore`, params)));
    },

    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [option('All', ''), option('Ongoing', 'ongoing'), option('Completed', 'completed')],
      },
      {
        type: 'select',
        id: 'genre',
        label: 'Genre',
        options: [option('All', ''), ...GENRES.map(([l, v]) => option(l, v))],
      },
      { type: 'separator' },
      ...TEXT_FILTERS.map(([id, label]): Filter => ({ type: 'text', id, label })),
    ],

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}?all=1`);
      const genres = document.select('.meta-pill-row .meta-pill').map((p) => p.text());
      const type = meta(document, 'Type');
      if (type) genres.push(type);
      const status = document.selectFirst('.hero-status-badge')?.text().toLowerCase() ?? '';
      const statuses: Record<string, MangaStatus> = { ongoing: 'ongoing', completed: 'completed' };
      const lowerType = type?.toLowerCase() ?? '';
      return {
        url: manga.url,
        title: document.selectFirst('.hero-title')?.text() || manga.title,
        author: meta(document, 'Author'),
        artist: meta(document, 'Artist'),
        description: document.selectFirst('.synopsis-text')?.text() || undefined,
        thumbnailUrl: document.selectFirst('.hero-cover img')?.absUrl('src') || manga.thumbnailUrl,
        status: statuses[status] ?? 'unknown',
        genres,
        type: lowerType.includes('manhwa')
          ? 'manhwa'
          : lowerType.includes('manhua')
            ? 'manhua'
            : lowerType.includes('manga')
              ? 'manga'
              : undefined,
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}?all=1`);
      return document.select('.chapter-row').flatMap((row): Chapter[] => {
        const name = row.selectFirst('.chapter-title')?.text();
        const href = row.attr('data-href');
        if (!name || !href) return [];
        const time = Date.parse(row.selectFirst('[data-local-time]')?.attr('data-local-time') ?? '');
        return [{ url: relativeUrl(href), name, uploadedAt: Number.isFinite(time) ? time : undefined }];
      });
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
      return document
        .select('img.page-img')
        .map((img) => img.absUrl('src') || img.attr('src') || '')
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]?.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
