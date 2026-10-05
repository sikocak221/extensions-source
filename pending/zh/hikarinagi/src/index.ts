import {
  type Chapter,
  type Filter,
  type FilterOption,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type SortValue,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://www.hikarinagi.org';
const IMAGE_BASE_URL = 'https://imagesp.yurari.moe';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const SORTS: [string, string][] = [
  ['更新时间', 'latest_chapter_at'],
  ['热度', 'heat'],
  ['收录时间', 'created_at'],
  ['发布时间', 'publication_date'],
  ['标题', 'title'],
];

// [filter id (query parameter), label, [label, value][]]
const SELECTS: [string, string, [string, string][]][] = [
  [
    'region',
    '地区',
    [
      ['全部', ''],
      ['日漫', 'jp'],
      ['韩漫', 'kr'],
      ['国漫', 'cn'],
      ['其他', 'other'],
    ],
  ],
  [
    'audience',
    '受众',
    [
      ['全部', ''],
      ['少年', 'shonen'],
      ['青年', 'seinen'],
      ['少女', 'shojo'],
      ['女性', 'josei'],
    ],
  ],
  [
    'status',
    '状态',
    [
      ['全部', ''],
      ['连载中', 'serializing'],
      ['已完结', 'finished'],
      ['休刊', 'paused'],
    ],
  ],
  [
    'decade',
    '年代',
    [
      ['全部', ''],
      ['2020 年代', '2020s'],
      ['2010 年代', '2010s'],
      ['2000 年代', '2000s'],
      ['更早', 'earlier'],
    ],
  ],
  [
    'magazine_id',
    '杂志',
    [
      ['全部', ''],
      ['週刊少年ジャンプ', '10659'],
      ['少年ジャンプ＋', '10752'],
      ['週刊少年サンデー', '10678'],
      ['週刊少年マガジン', '10702'],
      ['カドコミ', '10855'],
      ['アルファポリス電網浮遊都市', '11315'],
      ['コミックDAYS', '10860'],
      ['週刊少年チャンピオン', '10724'],
      ['モーニング', '10673'],
      ['ガンガンONLINE', '10786'],
      ['週刊ヤングマガジン', '10754'],
      ['週刊ヤングジャンプ', '10687'],
    ],
  ],
];

interface MangaItem {
  id: number;
  name: string;
  name_cn?: string | null;
  covers: { media?: { src?: string } }[];
  serial_status?: string | null;
  latest_chapter_at?: string | null;
  summary?: string | null;
}

interface MangaData {
  manga: MangaItem;
  chapters: { id: number; name: string; page_count: number }[];
  people: { role: string; person: { name: string; trans_name?: string | null } }[];
  tags: { tag: { name: string } }[];
}

async function api<T>(path: string): Promise<{ status: number; body: T }> {
  const response = await http.request<T>({ url: `${BASE_URL}${path}`, headers, responseType: 'json' });
  return { status: response.status, body: response.body };
}

function cover(item: MangaItem): string | undefined {
  const src = item.covers[0]?.media?.src;
  return src ? (src.startsWith('http') ? src : `${IMAGE_BASE_URL}/${src}`) : undefined;
}

function summary(item: MangaItem): MangaSummary {
  return { url: `/${item.id}`, title: item.name_cn ?? item.name, thumbnailUrl: cover(item) };
}

async function browse(page: number, query: string | null, sort: SortValue, filters: FilterState): Promise<MangaPage> {
  const params: [string, string][] = [
    ['page', String(page)],
    ['page_size', '24'],
  ];
  if (query?.trim()) params.push(['search', query]);
  params.push(['sort', `${sort.value}:${sort.ascending ? 'asc' : 'dssc'}`]);
  for (const [id] of SELECTS) {
    const value = filters[id];
    if (typeof value === 'string' && value) params.push([id, value]);
  }
  const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const { body } = await api<{
    list: { items: MangaItem[]; meta: { page: number | string; total_pages: number | string } };
  }>(`/api/pages/mangas/browse?${qs}`);
  const { items, meta } = body.list;
  return { items: items.map(summary), hasNextPage: Number(meta.page) < Number(meta.total_pages) };
}

const idOf = (url: string) => url.replace(/^\/+/, '').split('/')[0] ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => browse(page, null, { value: 'heat', ascending: false }, {}),
    getLatest: (page) => browse(page, null, { value: 'latest_chapter_at', ascending: false }, {}),
    search(query, page, filters): Promise<MangaPage> {
      const sort = (filters.sort as SortValue | undefined) ?? { value: 'latest_chapter_at', ascending: false };
      return browse(page, query, sort, filters);
    },
    getFilters: (): Filter[] => [
      {
        type: 'sort',
        id: 'sort',
        label: '排序',
        options: SORTS.map(([label, value]): FilterOption => ({ label, value })),
        default: { value: 'latest_chapter_at', ascending: false },
      },
      ...SELECTS.map(([id, label, options]): Filter => ({
        type: 'select',
        id,
        label,
        options: options.map(([l, value]) => ({ label: l, value })),
        default: '',
      })),
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { body: data } = await api<MangaData>(`/api/pages/mangas/${idOf(manga.url)}`);
      const people = new Map(data.people.map((p) => [p.role, p.person.trans_name ?? p.person.name] as const));
      const status: MangaStatus =
        data.manga.serial_status === 'SERIALIZING'
          ? 'ongoing'
          : data.manga.serial_status === 'FINISHED'
            ? 'completed'
            : 'unknown';
      return {
        ...summary(data.manga),
        author: people.get('ORIGINAL_CREATOR') ?? people.get('AUTHOR'),
        artist: people.get('ART'),
        description: data.manga.summary ?? undefined,
        genres: data.tags.map((t) => t.tag.name),
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const cid = idOf(manga.url);
      const { body: data } = await api<MangaData>(`/api/pages/mangas/${cid}`);
      const timestamp = Date.parse(data.manga.latest_chapter_at ?? '');
      return data.chapters
        .map((chapter) => ({
          url: `/${cid}/${chapter.id}`,
          name: chapter.name,
          scanlator: `${chapter.page_count}P`,
          uploadedAt: Number.isNaN(timestamp) ? undefined : timestamp,
        }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [cid, id] = chapter.url.split('/').filter(Boolean);
      const { status, body } = await api<{ manifest: { pages: { src: string }[] } }>(
        `/api/pages/mangas/reader/${cid}/${id}`,
      );
      if (status === 401) throw new Error('请先在 WebView 中登录');
      return body.manifest.pages.map((page, index) => ({ index, imageUrl: page.src }));
    },
    imageHeaders: () => headers,
    getWebUrl(item) {
      const [cid, id] = item.url.split('/').filter(Boolean);
      return id ? `${BASE_URL}/mangas/${cid}/read/${id}` : `${BASE_URL}/mangas/${cid}`;
    },
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)\/mangas\/(\d+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: `/${match[2]}`, title: '' };
    },
  }),
});
