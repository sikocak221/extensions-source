import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://comics.inkr.com';
const QUERY_API = 'https://icq-api.inkr.com/v1';
const CONTENT_API = 'https://icd-api.inkr.com/v1';
const PAGE_SIZE = 20;
const BATCH_SIZE = 50;
const IMAGE_VARIANT = 'w1600.ikc';
const apiHeaders = {
  'User-Agent': 'okhttp/4.9.1',
  'ikc-platform': 'android',
  'cf-ipcountry': 'en-GB',
  Accept: 'application/json',
};
// The app's image key, stored XORed with 0x5a.
const IMAGE_KEY = new Uint8Array(
  [
    0x1f, 0x17, 0x0b, 0x11, 0x39, 0x2d, 0x03, 0x2b, 0x0b, 0x2e, 0x36, 0x12, 0x68, 0x63, 0x11, 0x20, 0x09, 0x00, 0x29,
    0x1e, 0x35, 0x38, 0x12, 0x16, 0x6b, 0x37, 0x12, 0x2c, 0x20, 0x35, 0x2e, 0x36,
  ].map((b) => b ^ 0x5a),
);

const SHOW_NSFW_PREFERENCE: Preference = {
  type: 'switch',
  key: 'show_nsfw_titles',
  label: 'Show NSFW titles',
  default: false,
};

const SHOW_PAID_PREFERENCE: Preference = {
  type: 'switch',
  key: 'show_paid_chapters',
  label: 'Show paid chapters (marked 🔒)',
  default: true,
};

const TYPES: [string, string][] = [
  ['All', ''],
  ['Manga', 'manga'],
  ['Manhua', 'manhua'],
  ['Manhwa', 'manhwa'],
  ['Western comics', 'western-comics'],
];

const STATUSES: [string, string][] = [
  ['All', ''],
  ['Ongoing', 'ongoing'],
  ['Completed', 'completed'],
];

const GENRES: [string, string][] = [
  ['Action', 'ik-genre-2'],
  ['Adult Cast', 'ik-genre-93'],
  ['Adult Men', 'ik-genre-87'],
  ['Adult Women', 'ik-genre-138'],
  ['Adventure', 'ik-genre-8'],
  ['Age Gap', 'ik-genre-149'],
  ['Alternative World', 'ik-genre-143'],
  ['Animals', 'ik-genre-31'],
  ['Anthropomorphic', 'ik-genre-35'],
  ['Avant Garde', 'ik-genre-151'],
  ['BL / Boys Love', 'ik-genre-33'],
  ['CEOs', 'ik-genre-156'],
  ['CGDCT', 'ik-genre-94'],
  ['Childcare', 'ik-genre-95'],
  ['Childhood Friends', 'ik-genre-150'],
  ['Cohabitation', 'ik-genre-144'],
  ['Combat Sports', 'ik-genre-96'],
  ['Comedy', 'ik-genre-3'],
  ['Coming of Age', 'ik-genre-147'],
  ['Crime', 'ik-genre-25'],
  ['Crossdressing', 'ik-genre-97'],
  ['Cultivation', 'ik-genre-142'],
  ['Cyberpunk', 'ik-genre-98'],
  ['Delinquents', 'ik-genre-99'],
  ['Detective', 'ik-genre-100'],
  ['Disability', 'ik-genre-145'],
  ['Drama', 'ik-genre-12'],
  ['Ecchi', 'ik-genre-6'],
  ['Educational', 'ik-genre-101'],
  ['Family Life', 'ik-genre-148'],
  ['Fantasy', 'ik-genre-9'],
  ['Folklore', 'ik-genre-158'],
  ['Gag Humor', 'ik-genre-102'],
  ['Gender Bender', 'ik-genre-62'],
  ['GL / Girls Love', 'ik-genre-30'],
  ['Gore', 'ik-genre-103'],
  ['Gourmet', 'ik-genre-91'],
  ['Harem', 'ik-genre-43'],
  ['Harem Fight', 'ik-genre-137'],
  ['Healing', 'ik-genre-107'],
  ['High Stakes Game', 'ik-genre-104'],
  ['Historical', 'ik-genre-18'],
  ['Historical Fiction', 'ik-genre-59'],
  ['Horror', 'ik-genre-16'],
  ['Idols (Female)', 'ik-genre-105'],
  ['Idols (Male)', 'ik-genre-106'],
  ['Individual Sport', 'ik-genre-157'],
  ['Isekai', 'ik-genre-38'],
  ['Kids', 'ik-genre-141'],
  ['LGBTQI', 'ik-genre-32'],
  ['Love Polygon', 'ik-genre-108'],
  ['Magic', 'ik-genre-10'],
  ['Magical Girls', 'ik-genre-110'],
  ['Magical Sex Shift', 'ik-genre-109'],
  ['Married Life', 'ik-genre-155'],
  ['Martial Arts', 'ik-genre-4'],
  ['Mature', 'ik-genre-58'],
  ['Mecha', 'ik-genre-15'],
  ['Medical', 'ik-genre-111'],
  ['Memoir', 'ik-genre-112'],
  ['Military', 'ik-genre-41'],
  ['Music', 'ik-genre-21'],
  ['Mystery', 'ik-genre-24'],
  ['Mythology', 'ik-genre-113'],
  ['Neighbors', 'ik-genre-160'],
  ['Omegaverse', 'ik-genre-152'],
  ['One Shot', 'ik-genre-23'],
  ['Organized Crime', 'ik-genre-114'],
  ['Otaku Culture', 'ik-genre-115'],
  ['Parody', 'ik-genre-60'],
  ['Performing Arts', 'ik-genre-116'],
  ['Pirates', 'ik-genre-154'],
  ['Political', 'ik-genre-136'],
  ['Psychological', 'ik-genre-11'],
  ['Racing', 'ik-genre-118'],
  ['Reincarnation', 'ik-genre-119'],
  ['Religion', 'ik-genre-159'],
  ['Revenge', 'ik-genre-146'],
  ['Reverse Harem', 'ik-genre-120'],
  ['Romance', 'ik-genre-5'],
  ['Romantic Subtext', 'ik-genre-121'],
  ['Samurai', 'ik-genre-122'],
  ['School', 'ik-genre-7'],
  ['Sci-Fi', 'ik-genre-27'],
  ['Showbiz', 'ik-genre-123'],
  ['Shoujo Ai', 'ik-genre-28'],
  ['Shounen Ai', 'ik-genre-19'],
  ['Slice of Life', 'ik-genre-13'],
  ['Space', 'ik-genre-124'],
  ['Sports', 'ik-genre-20'],
  ['Steampunk', 'ik-genre-135'],
  ['Strategy Game', 'ik-genre-125'],
  ['Super Power', 'ik-genre-126'],
  ['Superhero', 'ik-genre-29'],
  ['Supernatural', 'ik-genre-1'],
  ['Survival', 'ik-genre-127'],
  ['Suspense', 'ik-genre-92'],
  ['Team Sports', 'ik-genre-128'],
  ['Teen Boys', 'ik-genre-140'],
  ['Teen Girls', 'ik-genre-139'],
  ['Thriller', 'ik-genre-17'],
  ['Time Travel', 'ik-genre-129'],
  ["TL (Teens' Love)", 'ik-genre-88'],
  ['Vampires', 'ik-genre-22'],
  ['Video Game', 'ik-genre-131'],
  ['Villainess', 'ik-genre-132'],
  ['Visual Arts', 'ik-genre-133'],
  ['Workplace', 'ik-genre-134'],
  ['Xuanhuan', 'ik-genre-34'],
  ['Yaoi', 'ik-genre-14'],
  ['Yuri', 'ik-genre-39'],
  ['Zombies', 'ik-genre-153'],
];

const TITLE_LIST_FIELDS = [
  'oid',
  'name',
  'thumbnailImage',
  'releaseStatus',
  'styleOrigin',
  'keyGenreList',
  'summary',
  'pageReadCount',
  'latestChapterFirstPublishedDate',
  'isExplicit',
  'monetizationType',
  'isAvailable',
  'isRemovedFromSale',
];
const TITLE_DETAIL_FIELDS = [...TITLE_LIST_FIELDS, 'chapterList', 'titleCreators'];
const CHAPTER_FIELDS = [
  'oid',
  'name',
  'order',
  'firstPublishedDate',
  'publishedDate',
  'revenueType',
  'coinPrice',
  'isPurchasedByCoin',
  'isPurchasedBySub',
];

interface TitleDto {
  oid: string;
  name?: string;
  thumbnailImage?: string | null;
  releaseStatus?: string | null;
  styleOrigin?: string | null;
  keyGenreList?: string[];
  summary?: string[];
  pageReadCount?: number;
  latestChapterFirstPublishedDate?: string | null;
  chapterList?: string[];
  titleCreators?: { creator: string }[];
  isExplicit?: boolean;
  isAvailable?: boolean;
  isRemovedFromSale?: boolean;
}

interface ChapterDto {
  oid: string;
  name?: string;
  order?: number;
  firstPublishedDate?: string | null;
  publishedDate?: string | null;
  revenueType?: string | null;
  isPurchasedByCoin?: boolean;
  isPurchasedBySub?: boolean;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await http.post(url, { json: body }, { headers: apiHeaders });
  return JSON.parse(response.body) as T;
}

async function contentMap<T>(oids: string[], fields: string[], includes?: unknown): Promise<Record<string, T>> {
  const result: Record<string, T> = {};
  for (let i = 0; i < oids.length; i += BATCH_SIZE) {
    const { data } = await post<{ data?: Record<string, T> }>(`${CONTENT_API}/content_json/batch`, [
      { fields, oids: oids.slice(i, i + BATCH_SIZE), ...(includes ? { includes } : {}) },
    ]);
    Object.assign(result, data ?? {});
  }
  return result;
}

const namedMap = (oids: string[]) =>
  contentMap<{ oid: string; name?: string; url?: string | null }>([...new Set(oids)], ['oid', 'name', 'url']);

let catalogCache: { key: string; titles: TitleDto[] } | undefined;

const genreId = (name: string) => GENRES.find(([g]) => g.toLowerCase() === name.toLowerCase())?.[1];

async function catalog(query: string, filters: FilterState): Promise<TitleDto[]> {
  const showNsfw = prefs.get<boolean>(SHOW_NSFW_PREFERENCE.key) ?? false;
  const type = typeof filters.type === 'string' ? filters.type : '';
  const status = typeof filters.status === 'string' ? filters.status : '';
  const genres = GENRES.filter(([, id]) => filters[`genre.${id}`] === true).map(([, id]) => id);
  const queryGenre = genreId(query);
  if (queryGenre) genres.push(queryGenre);
  const sort = typeof filters.sort === 'string' ? filters.sort : query && !queryGenre ? 'relevance' : 'popular';
  const key = [sort, query, type, status, genres.join(','), showNsfw].join('\u0000');
  if (catalogCache?.key === key) return catalogCache.titles;
  const request = {
    limit: 10000,
    ...(type ? { orStyleOrigin: [type] } : {}),
    ...(status ? { releaseStatus: status } : {}),
    ...(genres.length ? { andGenres: [...new Set(genres)] } : {}),
  };
  const filtered = () => post<{ data?: string[] }>(`${QUERY_API}/title/filtered`, request).then((r) => r.data ?? []);
  let oids: string[];
  if (!query || queryGenre) oids = await filtered();
  else {
    const found =
      (await post<{ data?: { title?: string[] } }>(`${QUERY_API}/title/search`, { query })).data?.title ?? [];
    if (type || status || genres.length) {
      const allowed = new Set(await filtered());
      oids = found.filter((o) => allowed.has(o));
    } else oids = found;
  }
  const byOid = await contentMap<TitleDto>(oids, TITLE_LIST_FIELDS);
  let titles = oids
    .flatMap((o) => (byOid[o] ? [byOid[o]!] : []))
    .filter((t) => t.isAvailable !== false && !t.isRemovedFromSale && (showNsfw || !t.isExplicit));
  // /title/search ranks poorly, so only name matches are kept.
  if (query && !queryGenre) titles = titles.filter((t) => (t.name ?? '').toLowerCase().includes(query.toLowerCase()));
  if (sort === 'popular') titles.sort((a, b) => (b.pageReadCount ?? 0) - (a.pageReadCount ?? 0));
  if (sort === 'latest')
    titles.sort((a, b) =>
      (b.latestChapterFirstPublishedDate ?? '').localeCompare(a.latestChapterFirstPublishedDate ?? ''),
    );
  catalogCache = { key, titles };
  return titles;
}

async function browse(page: number, query: string, filters: FilterState): Promise<MangaPage> {
  const titles = await catalog(query.trim(), filters);
  const slice = titles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const images = await namedMap(slice.flatMap((t) => (t.thumbnailImage ? [t.thumbnailImage] : [])));
  return {
    items: slice.map((t) => ({
      url: `/title/${t.oid.replace('ik-title-', '')}`,
      title: t.name ?? '',
      thumbnailUrl: images[t.thumbnailImage ?? '']?.url ?? undefined,
    })),
    hasNextPage: page * PAGE_SIZE < titles.length,
  };
}

const oidOf = (url: string) => `ik-title-${url.split('/')[2]?.split('-')[0] ?? ''}`;

function status(text: string | null | undefined): MangaStatus {
  const s = text?.toLowerCase();
  return s === 'ongoing' || s === 'completed' || s === 'hiatus' ? s : 'unknown';
}

const isFree = (c: ChapterDto) => ['ad', 'free'].includes(c.revenueType?.toLowerCase() ?? '');
const isAccessible = (c: ChapterDto) => isFree(c) || c.isPurchasedByCoin === true || c.isPurchasedBySub === true;

async function title(url: string): Promise<TitleDto> {
  const oid = oidOf(url);
  const found = (await contentMap<TitleDto>([oid], TITLE_DETAIL_FIELDS))[oid];
  if (!found) throw new Error('Title not found');
  return found;
}

export default defineExtension({
  preferences: () => [SHOW_NSFW_PREFERENCE, SHOW_PAID_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => browse(page, '', { sort: 'popular' }),
    getLatest: (page) => browse(page, '', { sort: 'latest' }),
    search: (query, page, filters) => browse(page, query, filters),
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'type',
        label: 'Type',
        options: TYPES.map(([l, v]) => ({ label: l, value: v })),
        default: '',
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: STATUSES.map(([l, v]) => ({ label: l, value: v })),
        default: '',
      },
      {
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: [...GENRES]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([label, id]) => ({ type: 'checkbox', id: `genre.${id}`, label })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const t = await title(manga.url);
      const [images, creators, genres] = await Promise.all([
        namedMap(t.thumbnailImage ? [t.thumbnailImage] : []),
        namedMap((t.titleCreators ?? []).map((c) => c.creator)),
        namedMap(t.keyGenreList ?? []),
      ]);
      const authors = [
        ...new Set(
          (t.titleCreators ?? []).flatMap((c) => (creators[c.creator]?.name ? [creators[c.creator]!.name!] : [])),
        ),
      ].join(', ');
      const origin = t.styleOrigin ? t.styleOrigin.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '';
      return {
        url: manga.url,
        title: t.name ?? manga.title,
        thumbnailUrl: images[t.thumbnailImage ?? '']?.url ?? manga.thumbnailUrl,
        author: authors || undefined,
        artist: authors || undefined,
        description: (t.summary ?? []).join('\n') || undefined,
        genres: [origin, ...(t.keyGenreList ?? []).flatMap((g) => (genres[g]?.name ? [genres[g]!.name!] : []))].filter(
          Boolean,
        ),
        status: status(t.releaseStatus),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const t = await title(manga.url);
      const showPaid = prefs.get<boolean>(SHOW_PAID_PREFERENCE.key) ?? true;
      const chapters = await contentMap<ChapterDto>(t.chapterList ?? [], CHAPTER_FIELDS);
      const titleId = t.oid.replace('ik-title-', '');
      return (t.chapterList ?? [])
        .flatMap((oid): Chapter[] => {
          const c = chapters[oid];
          if (!c) return [];
          const open = isAccessible(c);
          if (!open && !showPaid) return [];
          const date = Date.parse(c.firstPublishedDate ?? c.publishedDate ?? '');
          return [
            {
              url: `/title/${titleId}/chapter/${oid.replace('ik-chapter-', '')}`,
              name: `${open ? '' : '🔒 '}${c.name ?? ''}`,
              number: c.order,
              uploadedAt: Number.isNaN(date) ? undefined : date,
            },
          ];
        })
        .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const oid = `ik-chapter-${chapter.url.split('/').pop()}`;
      const meta = (await contentMap<ChapterDto>([oid], CHAPTER_FIELDS))[oid];
      if (meta && !isAccessible(meta))
        throw new Error(
          meta.revenueType?.toLowerCase() === 'coin-only'
            ? 'Chapter requires INKR coins'
            : 'Chapter requires INKR coins or an Extra subscription',
        );
      const pages = (
        await contentMap<{ chapterPages?: { url: string }[] }>([oid], ['chapterPages'], {
          chapterPages: { fields: ['oid', 'width', 'height', 'type'], includes: {}, includeKey: 'page' },
        })
      )[oid];
      return (pages?.chapterPages ?? []).map((p, index) => ({
        index,
        imageUrl: `${p.url.replace(/\/+$/, '')}/${IMAGE_VARIANT}`,
      }));
    },
    imageHeaders: () => ({ 'User-Agent': apiHeaders['User-Agent'] }),
    // .ikc files: 4-byte little-endian plaintext size, a 16-byte IV, then AES-CBC without padding.
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      if (!(page.imageUrl ?? '').endsWith('.ikc')) return {};
      const size = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
      const body = bytes.subarray(20);
      const plain = crypto.aesDecrypt(body.subarray(0, body.length - (body.length % 16)), IMAGE_KEY, {
        mode: 'cbc',
        iv: bytes.subarray(4, 20),
        padding: false,
      });
      return { bytes: plain.subarray(0, size) };
    },
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/title\/(\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/title/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
