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
import { USER_AGENT, withQuery } from './common/utils';

const DOMAIN = 'namicomi.com';
const BASE_URL = `https://${DOMAIN}`;
const API_URL = `https://api.${DOMAIN}`;
const CDN_URL = `https://uploads.${DOMAIN}`;
const LIMIT = 20;

const EXT_LANG: Record<string, string> = {
  'zh-Hans': 'zh-hans',
  'zh-Hant': 'zh-hant',
  'pt-BR': 'pt-br',
  pt: 'pt-pt',
  es: 'es-es',
};

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Origin: BASE_URL };

interface Entity {
  id: string;
  type: string;
  attributes?: Record<string, any>;
  relationships?: Entity[];
}

const TAG_GROUPS: [string, string][] = [
  ['content-warnings', 'Content'],
  ['format', 'Format'],
  ['genre', 'Genre'],
  ['theme', 'Theme'],
];

const STATUSES: [string, string][] = [
  ['Ongoing', 'ongoing'],
  ['Completed', 'completed'],
  ['Hiatus', 'hiatus'],
  ['Cancelled', 'cancelled'],
];
const RATINGS: [string, string][] = [
  ['Safe', 'safe'],
  ['Restricted', 'restricted'],
  ['Mature', 'mature'],
];
const SORTS: [string, string][] = [
  ['Alphabetic', 'title'], ['Chapter count', 'chapterCount'], ['Followers', 'followCount'], ['Likes', 'reactions'],
  ['Comment count', 'commentCount'], ['Content created at', 'publishedAt'], ['Views', 'views'], ['Year', 'year'], ['Rating', 'rating'],
]; // prettier-ignore

/** Builds a query string that allows repeated keys (`a[]=1&a[]=2`). */
const query = (pairs: [string, string][]) =>
  pairs.map(([k, v]) => `${k.replace(/\[/g, '%5B').replace(/\]/g, '%5D')}=${encodeURIComponent(v)}`).join('&');

const COMMON_INCLUDES: [string, string][] = ['cover_art', 'organization', 'tag', 'primary_tag', 'secondary_tag'].map(
  (v) => ['includes[]', v],
);
const COMMON_TYPES: [string, string][] = ['manhua', 'manwha', 'manga', 'comic'].map((v) => ['types[]', v]);

export default defineExtension({
  preferences: () => [
    {
      type: 'select',
      key: 'thumbnailQuality',
      label: 'Cover quality',
      options: [
        { label: 'Original', value: 'original' },
        { label: 'Medium', value: '.512.jpg' },
        { label: 'Low', value: '.256.jpg' },
      ],
      default: 'original',
    },
    {
      type: 'switch',
      key: 'dataSaver',
      label: 'Data saver',
      description: 'Enables smaller, more compressed images',
      default: false,
    },
    {
      type: 'switch',
      key: 'showLockedChapters',
      label: 'Show locked/paywalled chapters',
      description: 'Display chapters that require an account with a premium subscription',
      default: false,
    },
  ],

  createSource: (info: SourceInfo) => {
    const lang = info.lang;
    const extLang = EXT_LANG[lang] ?? lang;
    const getJson = async <T>(url: string): Promise<T> =>
      (await http.get<T>(url, { headers, responseType: 'json' })).body;

    function toManga(entity: Entity): MangaDetails {
      const attr = entity.attributes ?? {};
      const rels = entity.relationships ?? [];
      const tags = rels.filter((r) => ['tag', 'primary_tag', 'secondary_tag'].includes(r.type));
      const byGroup: Record<string, string[]> = {};
      for (const tag of tags) {
        const group = tag.attributes?.group as string;
        const name = (tag.attributes?.name?.[extLang] ?? tag.attributes?.name?.en) as string | undefined;
        if (name) (byGroup[group] ??= []).push(name);
      }
      const genres = ['content-warnings', 'format', 'genre', 'theme'].flatMap((g) => (byGroup[g] ?? []).sort());
      if (attr.contentRating && attr.contentRating !== 'safe') genres.push(`Content Rating: ${attr.contentRating}`);
      const titleMap = (attr.title ?? {}) as Record<string, string>;
      const cover = rels.find((r) => r.type === 'cover_art')?.attributes?.fileName as string | undefined;
      const quality = prefs.get<string>('thumbnailQuality');
      const suffix = quality && quality !== 'original' ? quality : '';
      const status: MangaStatus = ['ongoing', 'completed', 'hiatus', 'cancelled'].includes(attr.publicationStatus)
        ? (attr.publicationStatus as MangaStatus)
        : 'unknown';
      return {
        url: `/title/${entity.id}`,
        title: titleMap[extLang] ?? titleMap.en ?? Object.values(titleMap)[0] ?? '',
        thumbnailUrl: cover ? `${CDN_URL}/covers/${entity.id}/${cover}${suffix}` : undefined,
        description: (attr.description?.[lang] ?? attr.description?.en) as string | undefined,
        author:
          [
            ...new Set(
              rels
                .filter((r) => r.type === 'organization')
                .map((r) => r.attributes?.name as string)
                .filter(Boolean),
            ),
          ].join(', ') || undefined,
        genres,
        status,
      };
    }

    async function list(params: [string, string][]): Promise<MangaPage> {
      const result = await getJson<{ data: Entity[]; meta: { limit: number; offset: number; total: number } }>(
        `${API_URL}/title/search?${query(params)}`,
      );
      return {
        items: result.data.map(toManga),
        hasNextPage: result.meta.limit + result.meta.offset < result.meta.total,
      };
    }

    const paging = (page: number): [string, string][] => [
      ['limit', String(LIMIT)],
      ['offset', String(LIMIT * (page - 1))],
    ];

    return {
      baseUrl: BASE_URL,

      getPopular: (page: number) =>
        list([
          ['order[views]', 'desc'],
          ['availableTranslatedLanguages[]', extLang],
          ...paging(page),
          ...COMMON_INCLUDES,
          ...COMMON_TYPES,
        ]),

      getLatest: (page: number) =>
        list([
          ['order[publishedAt]', 'desc'],
          ['availableTranslatedLanguages[]', extLang],
          ...paging(page),
          ...COMMON_INCLUDES,
          ...COMMON_TYPES,
        ]),

      async getFilters(): Promise<Filter[]> {
        const filters: Filter[] = [
          { type: 'checkbox', id: 'hasChapters', label: 'Has available chapters' },
          {
            type: 'group',
            id: 'rating',
            label: 'Content rating',
            filters: RATINGS.map(([label, v]): Filter => ({ type: 'checkbox', id: `rating:${v}`, label })),
          },
          {
            type: 'group',
            id: 'status',
            label: 'Status',
            filters: STATUSES.map(([label, v]): Filter => ({ type: 'checkbox', id: `status:${v}`, label })),
          },
          {
            type: 'sort',
            id: 'sort',
            label: 'Sort',
            options: SORTS.map(([label, value]) => ({ label, value })),
            default: { value: 'publishedAt', ascending: false },
          },
        ];
        try {
          const tags = (await getJson<{ data: Entity[] }>(`${API_URL}/title/tags`)).data;
          filters.push(
            {
              type: 'select',
              id: 'includedTagsMode',
              label: 'Included tags mode',
              options: [
                { label: 'And', value: 'and' },
                { label: 'Or', value: 'or' },
              ],
            },
            {
              type: 'select',
              id: 'excludedTagsMode',
              label: 'Excluded tags mode',
              default: 'or',
              options: [
                { label: 'And', value: 'and' },
                { label: 'Or', value: 'or' },
              ],
            },
          );
          for (const [group, label] of TAG_GROUPS) {
            const items = tags
              .filter((t) => t.attributes?.group === group)
              .map((t) => ({ id: t.id, name: (t.attributes?.name?.[extLang] ?? t.attributes?.name?.en) as string }))
              .sort((a, b) => a.name.localeCompare(b.name));
            if (items.length) {
              filters.push({
                type: 'group',
                id: `tags-${group}`,
                label,
                filters: items.map((t): Filter => ({ type: 'tristate', id: `tag:${t.id}`, label: t.name })),
              });
            }
          }
        } catch {
          // Tags are optional.
        }
        return filters;
      },

      search(q: string, page: number, state: FilterState): Promise<MangaPage> {
        const params: [string, string][] = [...paging(page), ...COMMON_INCLUDES, ...COMMON_TYPES];
        const title = q.replace(/\s+/g, ' ').trim();
        if (title) params.push(['title', title]);
        if (state.hasChapters === true)
          params.push(['hasAvailableChapters', 'true'], ['availableTranslatedLanguages[]', extLang]);
        for (const [, v] of RATINGS) if (state[`rating:${v}`] === true) params.push(['contentRatings[]', v]);
        for (const [, v] of STATUSES) if (state[`status:${v}`] === true) params.push(['publicationStatuses[]', v]);
        const sort = state.sort;
        if (sort && typeof sort === 'object') params.push([`order[${sort.value}]`, sort.ascending ? 'asc' : 'desc']);
        for (const [key, value] of Object.entries(state)) {
          if (!key.startsWith('tag:')) continue;
          if (value === 'include') params.push(['includedTags[]', key.slice(4)]);
          else if (value === 'exclude') params.push(['excludedTags[]', key.slice(4)]);
        }
        if (typeof state.includedTagsMode === 'string') params.push(['includedTagsMode', state.includedTagsMode]);
        if (typeof state.excludedTagsMode === 'string') params.push(['excludedTagsMode', state.excludedTagsMode]);
        return list(params);
      },

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const result = await getJson<{ data?: Entity }>(
          `${API_URL}/title/${manga.url.split('/').pop()}?${query(COMMON_INCLUDES)}`,
        );
        return result.data ? toManga(result.data) : { ...manga, status: 'unknown' };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const url = (offset: number) =>
          `${API_URL}/chapter?${query([
            ['titleId', manga.url.split('/').pop()!], ['includes[]', 'organization'], ['limit', '200'], ['offset', String(offset)],
            ['translatedLanguages[]', extLang], ['order[volume]', 'desc'], ['order[chapter]', 'desc'],
          ])}`; // prettier-ignore
        type ChapterList = { data: Entity[]; meta: { limit: number; total: number } };
        const first = await getJson<ChapterList>(url(0));
        const chapters = [...first.data];
        for (
          let offset = first.meta.limit;
          offset < first.meta.total && first.meta.limit > 0;
          offset += first.meta.limit
        ) {
          chapters.push(...(await getJson<ChapterList>(url(offset))).data);
          await timers.sleep(0);
        }
        if (chapters.length === 0) return [];
        const access: Record<string, boolean> = {};
        for (let i = 0; i < chapters.length; i += 50) {
          const ids = chapters.slice(i, i + 50).map((c) => c.id);
          const response = await http.post<{ data?: { attributes?: { map?: Record<string, boolean> } } }>(
            `${API_URL}/gating/check`,
            { json: { entities: ids.map((entityId) => ({ entityId, entityType: 'chapter' })) } },
            { headers, responseType: 'json' },
          );
          Object.assign(access, response.body.data?.attributes?.map ?? {});
        }
        const showLocked = prefs.get<boolean>('showLockedChapters') === true;
        return chapters.flatMap((c): Chapter[] => {
          const accessible = access[c.id] !== false;
          if (!accessible && !showLocked) return [];
          const attr = c.attributes ?? {};
          let name = accessible ? '' : '🔒 ';
          if (attr.volume?.trim()) name += `Vol.${attr.volume}`;
          if (attr.chapter?.trim()) name += `${name.trim() && !name.endsWith('🔒 ') ? ' ' : ''}Ch.${attr.chapter}`;
          if (attr.name?.trim()) name += `${name.trim() && !name.endsWith('🔒 ') ? ' - ' : ''}${attr.name}`;
          return [
            {
              url: c.id,
              name: name.trim(),
              number: Number.parseFloat(attr.chapter) || undefined,
              uploadedAt: Date.parse(attr.publishAt) || undefined,
            },
          ];
        });
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const response = await http.request<{
          data?: { baseUrl: string; hash: string; source: { filename: string }[]; low: { filename: string }[] };
        }>({
          url: `${API_URL}/images/chapter/${chapter.url}?newQualities=true`,
          headers,
          responseType: 'json',
        });
        if (response.status === 402) throw new Error('This chapter is locked: purchase it on the website');
        if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
        const data = response.body.data;
        if (!data) return [];
        const prefix = `${data.baseUrl}/chapter/${chapter.url}/${data.hash}`;
        const saver = prefs.get<boolean>('dataSaver') === true;
        return (saver ? data.low : data.source).map((it, index) => ({
          index,
          imageUrl: `${prefix}/${saver ? 'low' : 'source'}/${it.filename}`,
        }));
      },

      imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),

      resolveUrl(url: string): MangaSummary | null {
        const match = /^https?:\/\/(?:www\.)?namicomi\.com\/[^/]+\/title\/([^/?#]+)/i.exec(url.trim());
        return match ? { url: `/title/${match[1]}`, title: '' } : null;
      },

      getWebUrl: (item: MangaSummary | Chapter) =>
        'title' in item ? `${BASE_URL}/${extLang}${item.url}` : `${BASE_URL}/${extLang}/chapter/${item.url}`,
    };
  },
});
