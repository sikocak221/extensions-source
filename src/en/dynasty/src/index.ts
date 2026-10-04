import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, htmlToText, parseDate } from './common/utils';
import { COVERS } from './covers';
import { TAGS } from './tags';

const BASE_URL = 'https://dynasty-scans.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const SERIES_TYPE = 'Series';
const CHAPTER_TYPE = 'Chapter';
const ANTHOLOGY_TYPE = 'Anthology';
const DOUJIN_TYPE = 'Doujin';
const ISSUE_TYPE = 'Issue';
const DIRS: Record<string, string> = {
  [SERIES_TYPE]: 'series',
  [ANTHOLOGY_TYPE]: 'anthologies',
  [DOUJIN_TYPE]: 'doujins',
  [ISSUE_TYPE]: 'issues',
};
const MANGA_DIRS = ['series', 'anthologies', 'doujins', 'issues', 'chapters'];
const CHAPTER_SLUG = /(.*?)_(ch[0-9_]+|volume_[0-9_\w]+)/;
const AUTHORS_UPPER_LIMIT = 15;

const FETCH_LIMIT_PREFERENCE: Preference = {
  type: 'select',
  key: 'chapterFetchLimit',
  label: 'Chapter list pages to fetch (mostly matters for Doujins; more pages load slower)',
  options: [
    { label: '2 pages', value: '2' },
    { label: '5 pages', value: '5' },
    { label: '10 pages', value: '10' },
    { label: 'All pages', value: 'all' },
  ],
  default: '2',
};

const SORTS: [string, string][] = [
  ['Smart', '_smart_'],
  ['Best Match', ''],
  ['Alphabetical', 'name'],
  ['Date Added', 'created_at'],
  ['Release Date', 'released_on'],
];

interface Tag {
  type: string;
  name: string;
  permalink: string;
}

interface MangaChapter {
  header?: string | null;
  title: string;
  permalink: string;
  released_on: string;
  tags: Tag[];
}

interface MangaResponse {
  name: string;
  type: string;
  permalink: string;
  tags: Tag[];
  cover?: string | null;
  description?: string | null;
  aliases: string[];
  taggings: MangaChapter[];
  total_pages?: number;
}

interface ChapterResponse {
  title: string;
  permalink: string;
  tags: Tag[];
  pages: { url: string }[];
  released_on: string;
}

async function getJson<T>(path: string): Promise<T> {
  return JSON.parse((await http.get(absoluteUrl(BASE_URL, path), { headers })).body) as T;
}

function coverUrl(file: string): string {
  const path = file.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');
  return `${BASE_URL}/${path.startsWith('system/') ? '' : 'system/tag_contents_covers/000/'}${path}`;
}

function cachedCover(directory: string, permalink: string): string | undefined {
  const file = COVERS[directory]?.[permalink];
  return file ? coverUrl(file) : undefined;
}

const permalinkToTitle = (permalink: string) =>
  permalink
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** Resolves a chapter path to its linked series when the permalink names one. */
function resolveEntryPath(directory: string, permalink: string): [string, string] {
  if (directory !== 'chapters') return [directory, permalink];
  const series = CHAPTER_SLUG.exec(permalink)?.[1];
  return series ? ['series', series] : [directory, permalink];
}

function entry(directory: string, permalink: string, title?: string): MangaSummary {
  return {
    url: `/${directory}/${permalink}`,
    title: title ?? permalinkToTitle(permalink),
    thumbnailUrl: cachedCover(directory, permalink),
  };
}

function dedupe(items: MangaSummary[]): MangaSummary[] {
  const seen = new Set<string>();
  return items.filter((m) => !seen.has(m.url) && seen.add(m.url));
}

async function tagId(query: string, type: string): Promise<number> {
  const response = await http.post(`${BASE_URL}/tags/suggest`, { form: { query } }, { headers });
  const found = (JSON.parse(response.body) as { id: number; name: string; type: string }[]).find(
    (t) => t.type === type && t.name.trim().toLowerCase() === query,
  );
  if (!found) throw new Error(`Unknown ${type}: ${query}`);
  return found.id;
}

const textValues = (filters: FilterState, id: string) =>
  (typeof filters[id] === 'string' ? (filters[id] as string) : '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

function status(names: Set<string>): MangaStatus {
  if (names.has('Ongoing')) return 'ongoing';
  if (names.has('Completed')) return 'completed';
  if (names.has('On Hiatus')) return 'hiatus';
  if (['Dropped', 'Cancelled', 'Not Updated', 'Abandoned', 'Removed'].some((s) => names.has(s))) return 'cancelled';
  return 'unknown';
}

function fetchLimit(): number {
  const value = prefs.get<string>(FETCH_LIMIT_PREFERENCE.key) ?? '2';
  return value === 'all' ? Number.MAX_SAFE_INTEGER : Number(value);
}

function grouped(entries: [string, string][]): string {
  const groups = new Map<string, string[]>();
  for (const [type, name] of entries) groups.set(type, [...(groups.get(type) ?? []), name]);
  return [...groups].map(([type, names]) => `${type}:\n${names.map((n) => `• ${n}`).join('\n')}`).join('\n\n');
}

const pathOf = (url: string): [string, string] => {
  const [, directory = '', permalink = ''] = url.split('/');
  return [directory, permalink];
};

export default defineExtension({
  preferences: () => [FETCH_LIMIT_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const response = await http.get(BASE_URL, {
        headers: { ...headers, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      });
      const document = html.load(response.body, { baseUrl: response.url });
      const items = document
        .select('h4:contains(Most Popular of Past 7 Days) ~ ul.cover-list a.thumbnail')
        .flatMap((a) => {
          const permalink = (a.absUrl('href') ?? '').replace(/^https?:\/\/[^/]+/, '').split('/')[2];
          return permalink ? [entry(...resolveEntryPath('chapters', permalink))] : [];
        });
      return { items: dedupe(items), hasNextPage: false };
    },
    async getLatest(page: number): Promise<MangaPage> {
      const data = await getJson<{
        chapters: { title: string; permalink: string; tags: Tag[] }[];
        current_page: number;
        total_pages: number;
      }>(`/chapters/added.json?page=${page - 1}`);
      const items: MangaSummary[] = [];
      for (const chapter of data.chapters) {
        let isSeries = false;
        for (const tag of chapter.tags) {
          const directory = DIRS[tag.type];
          if (!directory) continue;
          items.push(entry(directory, tag.permalink, tag.name));
          isSeries ||= tag.type === SERIES_TYPE;
        }
        // Chapters without a series (mostly doujins) are listed on their own.
        if (!isSeries) items.push({ url: `/chapters/${chapter.permalink}`, title: chapter.title });
      }
      return { items: dedupe(items), hasNextPage: data.current_page <= data.total_pages };
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const types = [SERIES_TYPE, CHAPTER_TYPE, ANTHOLOGY_TYPE, DOUJIN_TYPE, ISSUE_TYPE].filter(
        (t) => filters[`type.${t}`] !== false,
      );
      if (types.length === 0) throw new Error('Select at least one type');
      const withIds: number[] = [];
      for (const [id, type] of [
        ['author', 'Author'],
        ['scanlator', 'Scanlator'],
        ['pairing', 'Pairing'],
      ] as const)
        for (const value of textValues(filters, id)) withIds.push(await tagId(value, type));
      const params = [`q=${encodeURIComponent(query.trim())}`];
      const sort = typeof filters.sort === 'string' ? filters.sort : '_smart_';
      params.push(`sort=${sort === '_smart_' ? (query.trim() ? '' : 'released_on') : sort}`);
      for (const t of types) params.push(`classes[]=${t}`);
      // Series and doujins match best with chapters included; they are filtered below.
      if ((types.includes(SERIES_TYPE) || types.includes(DOUJIN_TYPE)) && !types.includes(CHAPTER_TYPE))
        params.push(`classes[]=${CHAPTER_TYPE}`);
      for (const tag of TAGS) {
        if (filters[`tag.${tag.id}`] === 'include') params.push(`with[]=${tag.id}`);
        if (filters[`tag.${tag.id}`] === 'exclude') params.push(`without[]=${tag.id}`);
      }
      for (const id of withIds) params.push(`with[]=${id}`);
      if (page > 1) params.push(`page=${page}`);
      const response = await http.get(`${BASE_URL}/search?${params.join('&')}`, { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      const parsed = document
        .select(
          '.chapter-list a.name[href*=/series/], .chapter-list a.name[href*=/anthologies/], .chapter-list a.name[href*=/chapters/], ' +
            '.chapter-list a.name[href*=/doujins/], .chapter-list a.name[href*=/issues/], .chapter-list .doujin_tags a[href*=/doujins/]',
        )
        .flatMap((a) => {
          const [directory, permalink] = pathOf((a.absUrl('href') ?? '').replace(/^https?:\/\/[^/]+/, ''));
          if (!permalink) return [];
          const [resolvedDir, resolvedPermalink] = resolveEntryPath(directory, permalink);
          return [
            resolvedDir !== directory
              ? entry(resolvedDir, resolvedPermalink)
              : entry(directory, permalink, a.text().trim()),
          ];
        });
      const excluded = [
        [SERIES_TYPE, '/series/'],
        [CHAPTER_TYPE, '/chapters/'],
        [DOUJIN_TYPE, '/doujins/'],
      ].filter(([t]) => !types.includes(t!));
      const items = dedupe(parsed).filter((m) => !excluded.some(([, prefix]) => m.url.startsWith(prefix!)));
      return {
        items: items.length ? items : parsed.slice(0, 1),
        hasNextPage: document.selectFirst('.pagination [rel=next]') != null,
      };
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: 'Sort',
        options: SORTS.map(([l, v]) => ({ label: l, value: v })),
        default: '_smart_',
      },
      {
        type: 'group',
        id: 'type',
        label: 'Type',
        filters: [SERIES_TYPE, CHAPTER_TYPE, ANTHOLOGY_TYPE, DOUJIN_TYPE, ISSUE_TYPE].map((t) => ({
          type: 'checkbox',
          id: `type.${t}`,
          label: t,
          default: true,
        })),
      },
      { type: 'header', label: 'Note: Sort and Type may not always work' },
      { type: 'separator' },
      {
        type: 'group',
        id: 'tag',
        label: 'Tags',
        filters: TAGS.map((t) => ({ type: 'tristate', id: `tag.${t.id}`, label: t.name })),
      },
      { type: 'text', id: 'author', label: 'Author' },
      { type: 'text', id: 'scanlator', label: 'Scanlator' },
      { type: 'text', id: 'pairing', label: 'Pairing' },
      {
        type: 'header',
        label: 'Note: Author, Scanlator and Pairing filters require the exact name. Separate several with commas (,)',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const [directory, permalink] = pathOf(manga.url);
      if (!MANGA_DIRS.includes(directory)) throw new Error('Migrate to Dynasty Scans to update url');
      if (directory === 'chapters') {
        const data = await getJson<ChapterResponse>(`/chapters/${permalink}.json`);
        const authors = data.tags.filter((t) => t.type === 'Author').map((t) => t.name);
        const others = data.tags
          .filter((t) => t.type !== 'Author' && t.type !== 'General')
          .map((t): [string, string] => [t.type, t.name]);
        return {
          url: manga.url,
          title: data.title,
          author: authors.join(', ') || undefined,
          artist: authors.join(', ') || undefined,
          description: [`Type: ${CHAPTER_TYPE}`, grouped(others), `Released: ${data.released_on}`]
            .filter(Boolean)
            .join('\n\n'),
          genres: data.tags.filter((t) => t.type === 'General').map((t) => t.name),
          thumbnailUrl: data.pages[0] ? coverUrl(data.pages[0].url) : undefined,
          status: 'completed',
        };
      }
      const data = await getJson<MangaResponse>(`/${directory}/${permalink}.json`);
      const authors = new Map<string, string>();
      const genres = new Set<string>();
      const others: [string, string][] = [];
      const statuses = new Set<string>();
      for (const tag of data.tags) {
        if (tag.type === 'Author') authors.set(tag.permalink, tag.name);
        else if (tag.type === 'General') genres.add(tag.name);
        else {
          if (tag.type === 'Status') statuses.add(tag.name);
          others.push([tag.type, tag.name]);
        }
      }
      for (const tagging of data.taggings) {
        if (tagging.header !== undefined && !tagging.permalink) continue;
        for (const tag of tagging.tags ?? []) {
          if (tag.type === 'Author') authors.set(tag.permalink, tag.name);
          else if (tag.type === 'General') genres.add(tag.name);
          else if (![SERIES_TYPE, DOUJIN_TYPE, ANTHOLOGY_TYPE, ISSUE_TYPE, 'Scanlator'].includes(tag.type))
            others.push([tag.type, tag.name]);
        }
      }
      const authorNames = [...authors.values()];
      const tooMany = authorNames.length > AUTHORS_UPPER_LIMIT;
      if (tooMany) others.push(...authorNames.map((n): [string, string] => ['Author', n]));
      const unique = [...new Map(others.map((o) => [o.join('\u0000'), o])).values()];
      const limit = fetchLimit();
      const description = [
        limit < (data.total_pages ?? 0)
          ? `IMPORTANT: Only the first ${limit} pages of the chapter list are fetched. You can change this in the extension settings.`
          : '',
        data.description
          ? htmlToText(
              data.description
                .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
                .replace(/<a\b[^>]*>.*?<\/a>/gis, ''),
            )
          : '',
        `Type: ${data.type}`,
        grouped(unique),
        data.aliases.length ? `Aliases:\n${data.aliases.map((a) => `• ${a}`).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      const author = tooMany ? `${authorNames.slice(0, AUTHORS_UPPER_LIMIT).join(', ')}...` : authorNames.join(', ');
      return {
        url: manga.url,
        title: data.name,
        author: author || undefined,
        artist: author || undefined,
        description,
        genres: [...genres],
        status: status(statuses),
        thumbnailUrl:
          (data.cover ? coverUrl(data.cover) : undefined) ?? cachedCover(directory, permalink) ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const [directory, permalink] = pathOf(manga.url);
      if (directory === 'chapters') {
        const data = await getJson<ChapterResponse>(`/chapters/${permalink}.json`);
        return [
          {
            url: `/chapters/${data.permalink}`,
            name: 'Chapter',
            scanlator:
              data.tags
                .filter((t) => t.type === 'Scanlator')
                .map((t) => t.name)
                .join(', ') || undefined,
            uploadedAt: parseDate(data.released_on, 'yyyy-MM-dd'),
          },
        ];
      }
      const first = await getJson<MangaResponse>(`/${directory}/${permalink}.json`);
      const items = [...first.taggings];
      const limit = fetchLimit();
      for (let page = 2; page <= (first.total_pages ?? 0) && page <= limit; page++)
        items.push(...(await getJson<MangaResponse>(`/${directory}/${permalink}.json?page=${page}`)).taggings);
      let header: string | null = null;
      const chapters: Chapter[] = [];
      for (const item of items) {
        if (!item.permalink) {
          header = item.header ?? null;
          continue;
        }
        let name = header ? `${header} ${item.title}` : item.title;
        if (first.type !== SERIES_TYPE) {
          const authors = item.tags.filter((t) => t.type === 'Author').map((t) => t.name);
          if (authors.length) name += ` by ${authors.join(' and ')}`;
        }
        chapters.push({
          url: `/chapters/${item.permalink}`,
          name,
          scanlator:
            item.tags
              .filter((t) => t.type === 'Scanlator')
              .map((t) => t.name)
              .join(', ') || undefined,
          uploadedAt: parseDate(item.released_on, 'yyyy-MM-dd'),
        });
      }
      return first.type !== DOUJIN_TYPE ? chapters.reverse() : chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [directory, permalink] = pathOf(chapter.url);
      if (directory !== 'chapters') throw new Error('Refresh Chapter List');
      const data = await getJson<ChapterResponse>(`/chapters/${permalink}.json`);
      return data.pages.map((p, index) => ({ index, imageUrl: BASE_URL + p.url }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)/i.exec(url.trim());
      if (!match || match[1]!.toLowerCase() !== hostOf(BASE_URL)) return null;
      const [directory, permalink] = resolveEntryPath(match[2]!, match[3]!);
      return MANGA_DIRS.includes(directory) ? { url: `/${directory}/${permalink}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
