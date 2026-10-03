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
import { USER_AGENT, absoluteUrl, hostOf, ownText, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://gensura.net';
const SEARCH = `${BASE_URL}/advanced-search/`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
let tags: Record<string, string> | null = null;

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function list(url: string): Promise<MangaPage> {
  const document = await load(url);
  const items = document.select('a[href^="/manga/"]').map((a) => ({
    url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
    title: ownText(a.selectFirst('h2')),
    thumbnailUrl: a.selectFirst('img')?.absUrl('src') || undefined,
  }));
  return {
    items: items.filter((m) => m.title),
    hasNextPage: document.select('a[href*=page]').some((a) => !a.text().trim()),
  };
}

async function tagIds(): Promise<Record<string, string>> {
  tags ??= Object.fromEntries(
    (await load(SEARCH))
      .select('li[onclick="updateTag(this)"]')
      .map((li) => [ownText(li).toLowerCase(), li.attr('data-value') ?? '']),
  );
  return tags;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`${SEARCH}?search=1&type=0&sort=1&page=${page}`),
    getLatest: (page) => list(`${SEARCH}?search=1&type=0&sort=2&page=${page}`),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const ids = await tagIds();
      const include: string[] = [];
      const exclude: string[] = [];
      for (const raw of (typeof filters.tags === 'string' ? filters.tags : '').split(',')) {
        const tag = raw.trim().toLowerCase();
        if (!tag) continue;
        const id = ids[tag.replace(/^-\s*/, '')];
        if (id) (tag.startsWith('-') ? exclude : include).push(id);
      }
      const text = (id: string, fallback: string) =>
        typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : fallback;
      return list(
        withQuery(SEARCH, {
          sort: text('sort', '2'),
          type: text('type', '0'),
          name: query.trim(),
          search: '1',
          include_tags: include.join(',') || undefined,
          exclude_tags: exclude.join(',') || undefined,
          page: page > 1 ? String(page) : undefined,
        }),
      );
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: 'Sort by',
        options: [
          { label: 'Newest', value: '2' },
          { label: 'Popular', value: '1' },
          { label: 'Relevance', value: '0' },
          { label: 'Best Rated', value: '3' },
          { label: 'Most Viewed', value: '4' },
        ],
      },
      {
        type: 'select',
        id: 'type',
        label: 'Types',
        options: [
          { label: 'All', value: '0' },
          { label: 'Manga', value: '1' },
          { label: 'Doujinshi', value: '2' },
        ],
      },
      { type: 'separator' },
      { type: 'header', label: 'Separate tags with commas (,)' },
      { type: 'header', label: 'Prepend with dash (-) to exclude' },
      { type: 'text', id: 'tags', label: 'Tags' },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const texts = (selector: string) => document.select(selector).map((a) => a.text());
      const titles = texts('h1.font-semibold').join(' ').split(' | ');
      const alt = texts('h2.text-lg.font-medium').join(' ');
      const artists = texts('a[href*="/authors/"]').join(', ');
      let description = '';
      if (titles[1]) description += `Alternative Titles: \n- ${titles[1]}\n${alt.trim() ? `- ${alt}\n` : ''}\n`;
      description += `Categories: ${texts('a[href*="/categories/"]').join(' ')}\nParodies: ${texts('a[href*="/parodies/"]').join(' ')}\nCircles: ${texts('a[href*="/circles/"]').join(' ')}\n\n`;
      description += `${texts('tr:contains(page)').join(' ')}\n${texts('tr:contains(view)').join(' ')}`;
      return {
        url: manga.url,
        title: titles[0] || manga.title,
        author: texts('a[href*="/circles/"]').join(', ') || artists || undefined,
        artist: artists || undefined,
        genres: texts('a[href*="/tags/"]'),
        description: description.trim(),
        thumbnailUrl: document.selectFirst('img[src*=thumbnail].w-96')?.absUrl('src') || manga.thumbnailUrl,
        status: 'completed',
      };
    },
    getChapters: async (manga: MangaSummary): Promise<Chapter[]> => [{ url: manga.url, name: 'Chapter' }],
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('img[src*=images]:not([src*=thumbnail]).w-full, img[data-src*=images]')
        .map((img, index) => ({
          index,
          imageUrl: (img.absUrl('src') || img.absUrl('data-src') || '').replace(/-t(?=\.)/, ''),
        }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
