import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities } from './common/utils';

const BASE_URL = 'https://xcomic.me';
const BROWSE_PAGE_SIZE = 12;
const SORTS: [string, string][] = [
  ['Rating Score', 'field_score'],
  ['Latest Update', 'field_update'],
  ['Recently Added', 'field_create'],
  ['Name A-Z', 'field_name_asc'],
  ['Name Z-A', 'field_name_desc'],
  ['Most Follows', 'field_follow'],
  ['Most Reviews', 'field_review'],
  ['Most Comments', 'field_comment'],
  ['Most Chapters', 'field_chapter'],
];
const UPLOAD_STATUS: [string, string][] = [
  ['Ongoing', 'ongoing'],
  ['Completed', 'completed'],
  ['Hiatus', 'hiatus'],
  ['Cancelled', 'cancelled'],
];

const BROWSE_FIELDS = `id data { title native_title romanized_title original_language translated_languages type cover_local_url cover_url comic_ids chap_last_public_at }`;
const Q_BROWSE = `query get_title_browse($select: Title_Browse_Select) { get_title_browse_items(select: $select) { ${BROWSE_FIELDS} } }`;
const Q_PAGER = `query get_title_browse_pager($select: Title_Browse_Select) { get_title_browse_pager(select: $select) { next total } }`;
const Q_TITLE = `query get_title_titleNode($id: ID!) { get_title_titleNode(id: $id) { id data { id title alt_titles native_title romanized_title original_language translated_languages authors artists year type type_id status description cover_local_url cover_url content_rating_id demographic_ids genre_ids format_ids chap_last_public_at is_merged merged_to comic_ids total_chapters } } }`;
const Q_COMIC_PROBE = `query get_comicNode($id: ID!) { get_comicNode(id: $id) { id data { subName dbStatus isPublic translatedLanguage chaps_normal } } }`;
const CHAPTER_FIELDS = `paging { next total } items { id data { id dname title urlPath dateCreate dateModify datePublic chaNum srcName } }`;
const Q_CHAPTERS_UNIQ = `query get_comic_chapterList_uniqList($select: Select_Comic_ChapterList_UniqList) { get_comic_chapterList_uniqList(select: $select) { ${CHAPTER_FIELDS} } }`;
const Q_CHAPTERS_FULL = `query get_comic_chapterList_fullList($select: Select_Comic_ChapterList) { get_comic_chapterList_fullList(select: $select) { ${CHAPTER_FIELDS} } }`;
const Q_PAGES = `query($id: ID!) { get_chapterNode(id: $id) { id data { imageUrls } } }`;

const LANG_CODE: Record<string, string> = { 'pt-br': 'pt_br', 'es-419': 'es_419', 'zh-hant': 'zh_hk', other: '_t' };

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function gql<T>(query: string, variables: unknown): Promise<T> {
  const res = await http.post<{ data?: T; errors?: { message: string }[] }>(
    `${BASE_URL}/query/`,
    { json: { query, variables } },
    { headers, responseType: 'json' },
  );
  if (!res.body.data) throw new Error(res.body.errors?.map((e) => e.message).join('; ') ?? 'GraphQL error');
  return res.body.data;
}

const idOf = (u: string) => u.split('/').pop()!;
const absUrl = (u: string) => (u.startsWith('http') ? u : BASE_URL + u);
const titleCase = (s: string) =>
  s
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

interface TitleNode {
  id?: string;
  title?: string;
  alt_titles?: (string | null)[];
  native_title?: string;
  romanized_title?: string;
  original_language?: string;
  translated_languages?: (string | null)[];
  authors?: string[];
  artists?: string[];
  year?: number;
  type?: string;
  type_id?: string;
  status?: string;
  description?: string;
  cover_local_url?: string;
  cover_url?: string;
  content_rating_id?: string;
  demographic_ids?: string[];
  genre_ids?: string[];
  format_ids?: string[];
  is_merged?: boolean;
  merged_to?: string;
  comic_ids?: string[];
}

async function fetchTitle(id: string): Promise<TitleNode | undefined> {
  const get = async (i: string) =>
    (await gql<{ get_title_titleNode?: { data?: TitleNode } | null }>(Q_TITLE, { id: i })).get_title_titleNode?.data;
  const title = await get(id);
  if (title?.is_merged && title.merged_to && title.merged_to !== id) return (await get(title.merged_to)) ?? title;
  return title;
}

function status(s: string | undefined): MangaStatus {
  const l = (s ?? '').toLowerCase();
  if (l.includes('pending')) return 'unknown';
  if (l.includes('releasing') || l.includes('ongoing')) return 'ongoing';
  if (l.includes('cancelled')) return 'cancelled';
  if (l.includes('hiatus')) return 'hiatus';
  if (l.includes('completed')) return 'completed';
  return 'unknown';
}

export default defineExtension({
  preferences: () => [
    {
      type: 'switch',
      key: 'REMOVE_TITLE_VERSION',
      label: 'Remove Version Information From Entry Titles',
      description: "Removes version tags like '(Official)' or '(Yaoi)' from entry titles.",
      default: false,
    },
    {
      type: 'switch',
      key: 'DEDUPLICATE_CHAPTERS',
      label: 'Deduplicate Chapter List',
      description: 'Use a deduplicated chapter list from the server. May hide duplicate uploads from the same edition.',
      default: true,
    },
  ],
  createSource: (info) => {
    const lang = info.lang.toLowerCase();
    const tLang = lang === 'all' ? undefined : (LANG_CODE[lang] ?? lang);

    const clean = (t: string) => {
      let s = decodeEntities(t);
      if (prefs.get<boolean>('REMOVE_TITLE_VERSION'))
        s = s.replace(/\([^()]*\)|\{[^{}]*\}|\[[^\]]*\]|«[^»]*»|「[^」]*」|『[^』]*』|《[^》]*》|\/\s?Official/gi, '');
      return s.trim();
    };

    async function browse(query: string, page: number, filters: FilterState, sortDefault: string): Promise<MangaPage> {
      const sort = typeof filters.sort === 'string' && filters.sort ? filters.sort : sortDefault;
      const origStatus = UPLOAD_STATUS.filter(([, v]) => filters[`status.${v}`] === true).map(([, v]) => v);
      const year = typeof filters.year === 'string' ? filters.year.trim() : '';
      const [y1, y2] = year.includes('-')
        ? year.split('-').map((x) => parseInt(x, 10))
        : [parseInt(year, 10), parseInt(year, 10)];
      const select = {
        word: query,
        page,
        size: BROWSE_PAGE_SIZE,
        init: (page - 1) * BROWSE_PAGE_SIZE,
        sortby: sort,
        where: 'browse',
        releaseYearMin: Number.isFinite(y1) ? y1 : undefined,
        releaseYearMax: Number.isFinite(y2) ? y2 : undefined,
        incTypes: [],
        incDemographics: [],
        incContentRatings: [],
        incOLangs: [],
        incTLangs: tLang ? [tLang] : [],
        incGenres: [],
        excGenres: [],
        origStatus,
        ignoreGlobalGenres: false,
        ignoreGlobalULangs: false,
        ignoreGlobalBlocks: false,
      };
      const [items, pager] = await Promise.all([
        gql<{
          get_title_browse_items?: {
            id?: string;
            data?: { title?: string; cover_local_url?: string; cover_url?: string };
          }[];
        }>(Q_BROWSE, { select }),
        gql<{ get_title_browse_pager: { next?: number } }>(Q_PAGER, { select }),
      ]);
      const seen = new Set<string>();
      const out: MangaSummary[] = [];
      for (const n of items.get_title_browse_items ?? []) {
        if (!n.id || seen.has(n.id)) continue;
        seen.add(n.id);
        const cover = n.data?.cover_local_url ?? n.data?.cover_url;
        out.push({
          url: `/title/${n.id}`,
          title: clean(n.data?.title ?? '') || n.id,
          thumbnailUrl: cover ? absUrl(cover) : undefined,
        });
      }
      return { items: out, hasNextPage: (pager.get_title_browse_pager.next ?? 0) !== 0 };
    }

    return {
      baseUrl: BASE_URL,
      imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),
      getPopular: (page) => browse('', page, {}, 'field_score'),
      getLatest: (page) => browse('', page, {}, 'field_update'),
      getFilters(): Filter[] {
        return [
          {
            type: 'select',
            id: 'sort',
            label: 'Order by',
            options: SORTS.map(([label, value]) => ({ value, label })),
          },
          {
            type: 'group',
            id: 'status',
            label: 'Original Work Status',
            filters: UPLOAD_STATUS.map(([label, v]): Filter => ({ type: 'checkbox', id: `status.${v}`, label })),
          },
          { type: 'text', id: 'year', label: 'Release year (or range, e.g. 2010-2020)' },
        ];
      },
      search: (query, page, filters) => browse(query.trim(), page, filters, 'field_score'),
      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const t = await fetchTitle(idOf(manga.url));
        if (!t) throw new Error(`Title not found: ${manga.url}`);
        const genres = new Set<string>();
        const add = (v?: string) => v && genres.add(titleCase(v));
        add(t.type ?? t.type_id);
        t.demographic_ids?.forEach(add);
        add(t.content_rating_id);
        t.genre_ids?.forEach(add);
        t.format_ids?.forEach(add);
        const alts = [t.native_title, t.romanized_title, ...(t.alt_titles ?? [])]
          .filter((x): x is string => !!x)
          .map((x) => decodeEntities(x.trim()))
          .filter((x) => x && x !== t.title);
        const parts: string[] = [];
        if (t.description?.trim()) parts.push(decodeEntities(t.description));
        if (t.year) parts.push(`Released: ${t.year}`);
        if (alts.length) parts.push(`Alternative Titles:\n${[...new Set(alts)].map((a) => `- ${a}`).join('\n')}`);
        const cover = t.cover_local_url ?? t.cover_url;
        return {
          url: manga.url,
          title: clean(t.title ?? manga.title),
          thumbnailUrl: cover ? absUrl(cover) : manga.thumbnailUrl,
          author: t.authors?.join(', ') || undefined,
          artist: t.artists?.join(', ') || undefined,
          genres: [...genres],
          description: parts.join('\n\n'),
          status: status(t.status),
        };
      },
      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const t = await fetchTitle(idOf(manga.url));
        if (!t) return [];
        const dedupe = prefs.get<boolean>('DEDUPLICATE_CHAPTERS') ?? true;
        const wanted = tLang;
        const editions: { id: string; label: string }[] = [];
        const probes = await Promise.all(
          [...new Set(t.comic_ids ?? [])].map(async (id) => ({
            id,
            probe: (
              await gql<{
                get_comicNode?: {
                  data?: { subName?: string; dbStatus?: string; isPublic?: boolean; translatedLanguage?: string };
                } | null;
              }>(Q_COMIC_PROBE, { id })
            ).get_comicNode?.data,
          })),
        );
        for (const { id, probe } of probes.sort((a, b) => a.id.localeCompare(b.id))) {
          if (!probe || probe.isPublic === false || (probe.dbStatus && probe.dbStatus !== 'normal')) continue;
          if (wanted && probe.translatedLanguage !== wanted) continue;
          editions.push({ id, label: decodeEntities(probe.subName ?? '').trim() });
        }
        const pageSize = dedupe ? 1000 : 100;
        type Item = {
          id: string;
          data: {
            dname?: string;
            title?: string;
            urlPath?: string;
            dateCreate?: number;
            dateModify?: number;
            datePublic?: number;
            chaNum?: number;
            srcName?: string;
          };
        };
        const chapters: (Chapter & { path?: string })[] = [];
        for (const ed of editions) {
          for (let page = 1; ; page++) {
            const select = { comic_id: ed.id, page, size: pageSize, sortby: 'chapter_desc' };
            const raw = await gql<Record<string, { paging: { next?: number }; items: Item[] }>>(
              dedupe ? Q_CHAPTERS_UNIQ : Q_CHAPTERS_FULL,
              { select },
            );
            const data = Object.values(raw)[0]!;
            for (const { id, data: c } of data.items) {
              const num = c.chaNum;
              const display = c.dname ?? '';
              let name = '';
              const n = num !== undefined ? String(num) : undefined;
              if (n && !display.includes(n)) name += `Chapter ${n}`;
              if (display) name += (name ? ': ' : '') + display;
              if (c.title) name += (name ? ': ' : '') + c.title;
              chapters.push({
                url: `/chapter/${id}`,
                name: name || id,
                number: num,
                scanlator: ed.label || (c.srcName ? decodeEntities(c.srcName).trim() : undefined),
                uploadedAt: c.dateModify ?? c.dateCreate ?? c.datePublic,
              });
            }
            if (!data.paging.next) break;
          }
        }
        return chapters.sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
      },
      async getPages(chapter: Chapter): Promise<Page[]> {
        const d = await gql<{ get_chapterNode: { data: { imageUrls: string[] } } }>(Q_PAGES, { id: idOf(chapter.url) });
        return d.get_chapterNode.data.imageUrls.map((u, index) => ({ index, imageUrl: absUrl(u) }));
      },
      getWebUrl: (item) => absUrl(item.url),
    };
  },
});
