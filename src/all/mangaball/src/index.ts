import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type SourceInfo,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate, withQuery } from './common/utils';
import { TAG_GROUPS } from './tags';

const BASE_URL = 'https://mangaball.com';
const COVER_BASE_URL = 'https://bulbasaur.poke-black-and-white.net/covers/';

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Accept: 'application/json, text/plain, */*' };

const SITE_LANGS: Record<string, string[]> = {
  ca: ['ca', 'ca-ad', 'ca-es', 'ca-fr', 'ca-it', 'ca-pt'],
  es: ['es', 'es-ar', 'es-mx', 'es-es', 'es-la', 'es-419'],
  it: ['it', 'it-it'],
  is: ['ib', 'ib-is', 'is'],
  ja: ['ja', 'jp'],
  ko: ['ko', 'kr'],
  kn: ['kn', 'kn-in', 'kn-my', 'kn-sg', 'kn-tw'],
  ml: ['ml', 'ml-in', 'ml-my', 'ml-sg', 'ml-tw'],
  nl: ['nl', 'nl-be'],
  'pt-BR': ['pt-br', 'pt-pt'],
  sr: ['sr', 'sr-cyrl'],
  th: ['th', 'th-hk', 'th-kh', 'th-la', 'th-my', 'th-sg'],
  zh: ['zh', 'zh-cn', 'zh-hk', 'zh-mo', 'zh-sg', 'zh-tw', 'cn'],
};

interface ImageDto {
  file?: string | null;
  cdn_mangadex?: string | null;
  cdn_mangaupdate?: string | null;
  cdn_mangaupdates?: string | null;
  cover?: { path?: string | null } | null;
}

/** Mirrors the site's getTitleImage priority: the self-hosted cover first, external mirrors only as fallbacks. */
function imageUrl(image: ImageDto | null | undefined): string | undefined {
  const path = image?.cover?.path?.trim().replace(/\\/g, '/');
  if (path) return path.startsWith('http') ? path : COVER_BASE_URL + path;
  return (
    [image?.file, image?.cdn_mangadex, image?.cdn_mangaupdate, image?.cdn_mangaupdates].find((u) => u && u.trim()) ||
    undefined
  );
}

interface TitleDto {
  id: string;
  slug: string;
  name: string;
  image?: ImageDto | null;
  description?: string[];
  alternateName?: string[];
  tags?: { name: string }[];
  author?: { name: string }[];
  status?: string | null;
}

interface ChapterDto {
  id: string;
  name?: string | null;
  number?: number | null;
  volume?: number;
  lang: string;
  group?: { name: string } | null;
  created_at?: string | null;
}

const option = (label: string, value: string) => ({ label, value });
const select = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  options: options.map(([l, v]) => option(l, v)),
});

function parseStatus(status: string | null | undefined): MangaStatus {
  switch (status) {
    case 'ongoing': return 'ongoing';
    case 'completed': return 'completed';
    case 'hiatus': return 'hiatus';
    case 'cancelled': return 'cancelled';
    default: return 'unknown';
  }
} // prettier-ignore

const trimNumber = (n: number) => String(n).replace(/\.0$/, '');

async function getJson<T>(url: string): Promise<T> {
  return (await http.get<T>(url, { headers, responseType: 'json' })).body;
}

async function searchAdvanced(
  page: number,
  query: string,
  state: FilterState,
  hideNsfw: boolean,
  sortBy?: string,
  sortOrder?: string,
): Promise<MangaPage> {
  const sort = state.sort && typeof state.sort === 'object' ? state.sort : undefined;
  const sortValue = sort && sort.value !== 'relevance' ? sort.value : undefined;
  // The API only orders by relevance when sort_by is omitted. Keyword-less browse falls back to last-updated.
  const effectiveSortBy = sortBy ?? sortValue ?? (query.trim() ? undefined : 'lastupdate');
  const params: Record<string, string> = { page: String(page), limit: '24' };
  if (effectiveSortBy) {
    params.sort_by = effectiveSortBy;
    params.sort_order = sortOrder ?? (sort?.ascending ? 'asc' : 'desc');
  }
  params.tag_mode = typeof state.tagmode === 'string' ? state.tagmode : 'AND';
  params.adult_mode = hideNsfw ? 'no_18' : 'all';
  if (query.trim()) params.keyword = query.trim();
  for (const [id, param] of [
    ['type', 'type'],
    ['demographic', 'publicationDemographic'],
    ['status', 'status'],
  ] as const) {
    const value = state[id];
    if (typeof value === 'string' && value) params[param] = value;
  }
  const included: string[] = [];
  const excluded: string[] = [];
  for (const group of TAG_GROUPS) {
    for (const [, id] of group.tags) {
      if (state[id] === 'include') included.push(id);
      else if (state[id] === 'exclude') excluded.push(id);
    }
  }
  if (included.length) params.included_tags = included.join(',');
  if (excluded.length) params.excluded_tags = excluded.join(',');
  const result = await getJson<{ data: TitleDto[]; pagination: { page: number; total_pages: number } }>(
    withQuery(`${BASE_URL}/api/v1/title/search-advanced`, params),
  );
  return {
    // The url is the title id (the details endpoint accepts ids and slugs).
    items: result.data.map((t) => ({ url: `/${t.id}`, title: t.name, thumbnailUrl: imageUrl(t.image) })),
    hasNextPage: result.pagination.page < result.pagination.total_pages,
  };
}

export default defineExtension({
  preferences: () => [
    {
      type: 'switch',
      key: 'nsfw_pref',
      label: 'Hide NSFW content',
      description: 'Hide titles marked as 18+',
      default: false,
    },
  ],

  createSource: (info: SourceInfo) => {
    const siteLang = SITE_LANGS[info.lang] ?? [info.lang];
    const hideNsfw = () => prefs.get<boolean>('nsfw_pref') === true;

    return {
      baseUrl: BASE_URL,

      getPopular: (page: number) => searchAdvanced(page, '', {}, hideNsfw(), 'views', 'desc'),

      getLatest: (page: number) => searchAdvanced(page, '', {}, hideNsfw(), 'lastupdate', 'desc'),

      search: (query: string, page: number, state: FilterState) => searchAdvanced(page, query, state, hideNsfw()),

      getFilters(): Filter[] {
        return [
          {
            type: 'sort',
            id: 'sort',
            label: 'Sort By',
            options: [
              option('Relevance', 'relevance'),
              option('Latest Updated', 'lastupdate'),
              option('Most Viewed', 'views'),
              option('Top Rated', 'rating'),
              option('Recently Added', 'created_at'),
              option('Title', 'name'),
            ],
            default: { value: 'relevance', ascending: false },
          },
          select('type', 'Type', [
            ['All', ''],
            ['Manga', 'manga'],
            ['Manhwa', 'manhwa'],
            ['Manhua', 'manhua'],
            ['Comics', 'comics'],
          ]),
          select('demographic', 'Magazine Demographic', [
            ['All', ''],
            ['Shounen', 'shounen'],
            ['Shoujo', 'shoujo'],
            ['Seinen', 'seinen'],
            ['Josei', 'josei'],
          ]),
          select('status', 'Publication Status', [
            ['All', ''],
            ['Ongoing', 'ongoing'],
            ['Completed', 'completed'],
            ['Hiatus', 'hiatus'],
            ['Cancelled', 'cancelled'],
          ]),
          select('tagmode', 'Tag Mode', [
            ['AND', 'AND'],
            ['OR', 'OR'],
          ]),
          ...TAG_GROUPS.map((group): Filter => ({
            type: 'group',
            id: group.id,
            label: group.label,
            filters: group.tags.map(([label, id]): Filter => ({ type: 'tristate', id, label })),
          })),
        ];
      },

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const { data } = await getJson<{ data: TitleDto }>(`${BASE_URL}/api/v1/title/detail/${manga.url.slice(1)}`);
        const alt = (data.alternateName ?? []).map((n) => `- ${n}`).join('\n');
        let description = (data.description ?? []).join('\n\n');
        if (alt.trim()) description += `\n\nAlternative Names: \n${alt}`;
        return {
          url: manga.url,
          title: data.name,
          thumbnailUrl: imageUrl(data.image) ?? manga.thumbnailUrl,
          genres: (data.tags ?? []).map((t) => t.name),
          author: (data.author ?? []).map((a) => a.name).join(', ') || undefined,
          description: description.trim() || undefined,
          status: parseStatus(data.status),
        };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const response = await http.post<{ data: ChapterDto[] }>(
          `${BASE_URL}/api/v1/chapter/chapter-listing-by-title-id`,
          { json: { title_id: manga.url.slice(1) } },
          { headers, responseType: 'json' },
        );
        await timers.sleep(0);
        const chapters: Chapter[] = [];
        for (const [i, c] of response.body.data.entries()) {
          if (i % 300 === 0) await timers.sleep(0);
          if (!siteLang.includes(c.lang)) continue;
          const chapterName = (c.name ?? '').trim();
          let name = '';
          if (c.volume && c.volume > 0) name += `Vol. ${trimNumber(c.volume)} `;
          const numberStr = trimNumber(c.number ?? Number.NaN);
          if (chapterName.includes(numberStr)) name += chapterName;
          else name += `Ch. ${numberStr}${chapterName ? ` ${chapterName}` : ''}`;
          chapters.push({
            url: c.id,
            name,
            number: c.number ?? undefined,
            scanlator: c.group?.name,
            uploadedAt: parseDate(c.created_at?.replace('T', ' ').replace(/\..*$/, ''), 'yyyy-MM-dd HH:mm:ss'),
          });
        }
        return chapters;
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const result = await getJson<{ data: { chapter: { pages?: string[] } } }>(
          `${BASE_URL}/api/v1/chapter-detail?chapter_id=${chapter.url}`,
        );
        // Count the view like the site's reader does; failures do not matter.
        http
          .post(
            `${BASE_URL}/api/v1/views/update`,
            { json: { object_id: chapter.url, object_type: 'chapter' } },
            { headers },
          )
          .catch(() => undefined);
        return (result.data.chapter.pages ?? []).map((url, index) => ({ index, imageUrl: url }));
      },

      imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),

      resolveUrl(url: string): MangaSummary | null {
        const match = /^https?:\/\/(?:www\.)?mangaball\.(?:com|net)\/title-detail\/([^/?#]+)/i.exec(url.trim());
        return match ? { url: `/${match[1]}`, title: '' } : null;
      },

      getWebUrl: (item: MangaSummary | Chapter) =>
        'title' in item ? `${BASE_URL}/title-detail/${item.url.replace(/^\//, '')}` : `${BASE_URL}/chapter-detail/${item.url}`,
    };
  },
});
