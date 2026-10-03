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
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://weebcentral.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
// The API ignores "limit" and always answers 32 entries.
const FETCH_LIMIT = 32;

const SORTS = ['Best Match', 'Alphabet', 'Popularity', 'Subscribers', 'Recently Added', 'Latest Updates'];
const STATUSES = ['Ongoing', 'Complete', 'Hiatus', 'Canceled'];
const TYPES = ['Manga', 'Manhwa', 'Manhua', 'OEL'];
const TAGS = [
  'Action',
  'Adult',
  'Adventure',
  'Comedy',
  'Doujinshi',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Gender Bender',
  'Harem',
  'Hentai',
  'Historical',
  'Horror',
  'Isekai',
  'Josei',
  'Lolicon',
  'Martial Arts',
  'Mature',
  'Mecha',
  'Mystery',
  'Psychological',
  'Romance',
  'School Life',
  'Sci-fi',
  'Seinen',
  'Shotacon',
  'Shoujo',
  'Shoujo Ai',
  'Shounen',
  'Shounen Ai',
  'Slice of Life',
  'Smut',
  'Sports',
  'Supernatural',
  'Tragedy',
  'Yaoi',
  'Yuri',
  'Other',
];

const TRISTATE = ['Any', 'True', 'False'];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function sourceImg(el: HtmlElement | null | undefined): string | undefined {
  const srcset = el?.selectFirst('source')?.attr('srcset');
  if (srcset) return srcset.replace('small', 'normal');
  return el?.selectFirst('img')?.absUrl('src') || undefined;
}

async function search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
  const value = (id: string, fallback: string) =>
    typeof filters[id] === 'string' ? (filters[id] as string) : fallback;
  const params = [`text=${encodeURIComponent(query.replace(/[!#:(),-]/g, ' ').trim())}`];
  params.push(`sort=${encodeURIComponent(value('sort', 'Best Match'))}`, `order=${value('order', 'Descending')}`);
  for (const id of ['official', 'anime', 'adult']) params.push(`${id}=${value(id, 'Any')}`);
  const author = value('author', '').trim();
  if (author) params.push(`author=${encodeURIComponent(author)}`);
  for (const s of STATUSES)
    if (filters[`status.${s}`] === true) params.push(`included_status=${encodeURIComponent(s)}`);
  for (const t of TYPES) if (filters[`type.${t}`] === true) params.push(`included_type=${encodeURIComponent(t)}`);
  for (const t of TAGS) {
    if (filters[`tag.${t}`] === 'include') params.push(`included_tag=${encodeURIComponent(t)}`);
    if (filters[`tag.${t}`] === 'exclude') params.push(`excluded_tag=${encodeURIComponent(t)}`);
  }
  params.push(`limit=${FETCH_LIMIT}`, `offset=${(page - 1) * FETCH_LIMIT}`, 'display_mode=Full%20Display');
  const document = await load(`/search/data?${params.join('&')}`);
  const items = document.select('article > section > a').flatMap((a): MangaSummary[] => {
    const title = a.selectFirst('div:not([class]):last-child')?.text();
    if (!title) return [];
    return [{ url: relativeUrl(a.absUrl('href') || a.attr('href') || ''), title, thumbnailUrl: sourceImg(a) }];
  });
  return { items, hasNextPage: document.selectFirst('button') != null };
}

function status(text: string | undefined): MangaStatus {
  switch (text?.toLowerCase()) {
    case 'ongoing':
      return 'ongoing';
    case 'complete':
      return 'completed';
    case 'hiatus':
      return 'hiatus';
    case 'canceled':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

const seriesId = (url: string) => url.split('/')[2] ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search('', page, { sort: 'Popularity' }),
    getLatest: (page) => search('', page, { sort: 'Latest Updates' }),
    search,
    getFilters: (): Filter[] => {
      const select = (id: string, label: string, options: string[], fallback = options[0]!): Filter => ({
        type: 'select',
        id,
        label,
        options: options.map((o) => ({ label: o, value: o })),
        default: fallback,
      });
      return [
        select('sort', 'Sort', SORTS),
        select('order', 'Sort Order', ['Descending', 'Ascending']),
        select('official', 'Official Translation', TRISTATE),
        select('anime', 'Anime Adaptation', TRISTATE),
        select('adult', 'Adult Content', TRISTATE),
        { type: 'text', id: 'author', label: 'Author (Case-sensitive)' },
        {
          type: 'group',
          id: 'status',
          label: 'Series Status',
          filters: STATUSES.map((s) => ({ type: 'checkbox', id: `status.${s}`, label: s })),
        },
        {
          type: 'group',
          id: 'type',
          label: 'Series Type',
          filters: TYPES.map((t) => ({ type: 'checkbox', id: `type.${t}`, label: t })),
        },
        {
          type: 'group',
          id: 'tag',
          label: 'Tags',
          filters: TAGS.map((t) => ({ type: 'tristate', id: `tag.${t}`, label: t })),
        },
      ];
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const [side, main] = document.select('section[x-data] > section');
      const lines: string[] = [];
      const summary = main?.selectFirst('li:has(strong:contains(Description)) > p')?.text();
      if (summary) lines.push(summary.replace('NOTE: ', '\n\nNOTE: '));
      const related = main?.select('li:has(strong:contains(Related Series)) li') ?? [];
      if (related.length)
        lines.push(
          `Related Series(s):${related
            .map((li) => {
              const a = li.selectFirst('a');
              return `\n- [${a?.text() ?? ''}](${a?.absUrl('href') ?? ''}) ${li.selectFirst('span')?.text() ?? ''}`.trimEnd();
            })
            .join('')}`,
        );
      const names = main?.select('li:has(strong:contains(Associated Name)) li') ?? [];
      if (names.length) lines.push(`Associated Name(s):${names.map((n) => `\n- ${n.text()}`).join('')}`);
      const trackers = document.select('li:has(strong:contains(Track)) span[data-tip]');
      if (trackers.length)
        lines.push(
          `Tracker(s):${trackers.map((t) => `\n- [${t.attr('data-tip')}](${t.selectFirst('a')?.absUrl('href') ?? ''})`).join('')}`,
        );
      return {
        url: manga.url,
        title: main?.selectFirst('h1')?.text() || manga.title,
        thumbnailUrl: sourceImg(side) ?? manga.thumbnailUrl,
        author:
          side
            ?.select('ul > li:has(strong:contains(Author)) > span > a')
            .map((a) => a.text())
            .join(', ') || undefined,
        genres: side?.select('ul > li:has(strong:contains(Tag),strong:contains(Type)) a').map((a) => a.text()) ?? [],
        status: status(side?.selectFirst('ul > li:has(strong:contains(Status)) > a')?.text()),
        description: lines.join('\n\n').trim() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const links = (await load(`/series/${seriesId(manga.url)}/full-chapter-list`)).select('div[x-data] > a');
      const chapters: Chapter[] = [];
      let indexed = false;
      for (const [index, a] of links.entries()) {
        const name = a.selectFirst('span.flex > span')?.text() ?? '';
        indexed = /(Season|S)\s*\d+/i.test(name);
        const date = Date.parse(a.selectFirst('time[datetime]')?.attr('datetime') ?? '');
        const official = a.select('img').some((img) => (img.attr('src') ?? '').toLowerCase().includes('official'));
        chapters.push({
          url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
          name,
          number: indexed ? links.length - index : undefined,
          uploadedAt: Number.isNaN(date) ? undefined : date,
          scanlator: official ? 'Official' : 'Unknown',
        });
        if (index % 300 === 299) await timers.sleep(0);
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(`${chapter.url.replace(/\/+$/, '')}/images?is_prev=False&reading_style=long_strip`);
      return document
        .select('section[x-data*=scroll] > img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => ({ ...headers, Accept: 'image/avif,image/webp,*/*' }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL)
        ? { url: `/series/${match[2]}/${match[3]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
