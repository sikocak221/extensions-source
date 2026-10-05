import {
  type Chapter,
  type Filter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://komiic.com';
// Using 20 causes weird behavior in the site's filter endpoint.
const PAGE_SIZE = 30;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const CHAPTER_FILTER: Preference = {
  type: 'select',
  key: 'CHAPTER_FILTER',
  label: '章節列表顯示',
  options: [
    { label: '同時顯示卷和章節', value: 'all' },
    { label: '僅顯示章節', value: 'chapter' },
    { label: '僅顯示卷', value: 'book' },
  ],
  default: 'all',
};

const STATUSES: [string, string][] = [
  ['全部', ''],
  ['連載', 'ONGOING'],
  ['完結', 'END'],
];
const SORTS: [string, string][] = [
  ['更新', 'DATE_UPDATED'],
  ['本月觀看數（不能篩選類型）', 'MONTH_VIEWS'],
  ['觀看數', 'VIEWS'],
  ['喜愛數', 'FAVORITE_COUNT'],
];
const RATINGS: [string, string][] = [
  ['全部', ''],
  ['無', '0'],
  ['1', '1'],
  ['2', '2'],
  ['3', '3'],
  ['≥4', '4'],
  ['5', '5'],
];

const COMIC_BODY = '{ id title description status imageUrl authors { id name } categories { id name } warnings }';

interface Item {
  id: string;
  name: string;
}

interface ComicDto {
  id: string;
  title: string;
  description: string;
  status: string;
  imageUrl: string;
  authors: Item[];
  categories: Item[];
  warnings: string[];
}

interface ChapterDto {
  id: string;
  serial: string;
  type: string;
  size: number;
  dateCreated: string;
}

interface Data {
  comics?: ComicDto[];
  searchComicsAndAuthors?: { comics: ComicDto[] };
  allCategory?: Item[];
  comicById?: ComicDto;
  chaptersByComicId?: ChapterDto[];
  imagesByChapterId?: { kid: string }[];
  recommendComicById?: string[];
}

let categories: Item[] = [];

async function query(operationName: string, body: string, variables: Record<string, unknown>): Promise<Data> {
  const response = await http.request<{ data?: Data; errors?: { message: string }[] }>({
    url: `${BASE_URL}/api/query`,
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Accept: '*/*' },
    body: { json: { operationName, query: body, variables } },
    responseType: 'json',
  });
  if (!response.body?.data) throw new Error(response.body?.errors?.[0]?.message ?? `HTTP ${response.status}`);
  return response.body.data;
}

const allCategory = () => (categories.length === 0 ? 'allCategory { id name }' : '');

function toDetails(dto: ComicDto): MangaDetails {
  const status: MangaStatus = dto.status === 'ONGOING' ? 'ongoing' : dto.status === 'END' ? 'completed' : 'unknown';
  return {
    url: `/comic/${dto.id}`,
    title: dto.title,
    thumbnailUrl: dto.imageUrl,
    author: dto.authors.map((a) => a.name).join('，'),
    genres: [...dto.categories.map((c) => c.name), ...dto.warnings],
    description: dto.description,
    status,
  };
}

function parseListing(data: Data): MangaPage {
  if (data.allCategory) categories = data.allCategory;
  const listing = data.comics ?? data.searchComicsAndAuthors?.comics ?? [];
  return {
    items: listing.map((dto): MangaSummary => ({
      url: `/comic/${dto.id}`,
      title: dto.title,
      thumbnailUrl: dto.imageUrl,
    })),
    hasNextPage: listing.length === PAGE_SIZE,
  };
}

async function mangasPage(page: number, orderBy: string): Promise<MangaPage> {
  const operation = orderBy === 'DATE_UPDATED' ? 'recentUpdate' : 'hotComics';
  const data = await query(
    'commonQuery',
    `query commonQuery($pagination: Pagination!) { comics: ${operation}(pagination: $pagination) ${COMIC_BODY} ${allCategory()} }`,
    {
      pagination: {
        offset: (page - 1) * PAGE_SIZE,
        orderBy,
        status: '',
        asc: false,
        limit: PAGE_SIZE,
        sexyLevel: null,
      },
      categoryId: [],
    },
  );
  return parseListing(data);
}

const idOf = (url: string) => url.split('/').pop() ?? '';

export default defineExtension({
  preferences: () => [CHAPTER_FILTER],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => mangasPage(page, 'MONTH_VIEWS'),
    getLatest: (page) => mangasPage(page, 'DATE_UPDATED'),
    async search(keyword, page, filters): Promise<MangaPage> {
      if (keyword.trim()) {
        return parseListing(
          await query(
            'searchComicsAndAuthors',
            `query searchComicsAndAuthors($keyword: String!) { searchComicsAndAuthors(keyword: $keyword) { comics ${COMIC_BODY} } ${allCategory()} }`,
            { keyword },
          ),
        );
      }
      const value = (id: string, fallback: string) =>
        typeof filters[id] === 'string' ? (filters[id] as string) : fallback;
      const rating = value('rating', '');
      const categoryId = categories.filter((c) => filters[`category.${c.id}`] === true).map((c) => c.id);
      return parseListing(
        await query(
          'comicByCategories',
          `query comicByCategories($categoryId: [ID!]!, $pagination: Pagination!) { comics: comicByCategories(categoryId: $categoryId, pagination: $pagination) ${COMIC_BODY} ${allCategory()} }`,
          {
            categoryId,
            pagination: {
              offset: (page - 1) * PAGE_SIZE,
              orderBy: value('sort', 'DATE_UPDATED'),
              status: value('status', ''),
              asc: false,
              limit: PAGE_SIZE,
              sexyLevel: rating === '' ? null : Number(rating),
            },
          },
        ),
      );
    },
    async getFilters(): Promise<Filter[]> {
      if (categories.length === 0)
        await mangasPage(1, 'DATE_UPDATED').catch((error) => log.warn('Cannot load categories', error));
      const select = (id: string, label: string, options: [string, string][]): Filter => ({
        type: 'select',
        id,
        label,
        options: options.map(([l, value]) => ({ label: l, value })),
        default: options[0]![1],
      });
      return [
        { type: 'header', label: '篩選條件（搜索關鍵字時無效）' },
        ...(categories.length
          ? [
              {
                type: 'group',
                id: 'category',
                label: '類型（篩選同時包含全部所選標簽的漫畫）',
                filters: categories.map((c): Filter => ({ type: 'checkbox', id: `category.${c.id}`, label: c.name })),
              } as Filter,
            ]
          : []),
        select('sort', '排序', SORTS),
        select('status', '狀態', STATUSES),
        select('rating', '色氣程度', RATINGS),
      ];
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const data = await query(
        'mangaQuery',
        `query mangaQuery($comicId: ID!) { comicById(comicId: $comicId) ${COMIC_BODY} }`,
        { comicId: idOf(manga.url) },
      );
      return toDetails(data.comicById!);
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const data = await query(
        'mangaQuery',
        'query mangaQuery($comicId: ID!) { chaptersByComicId(comicId: $comicId) { id serial type size dateCreated } }',
        { comicId: idOf(manga.url) },
      );
      const filter = prefs.get<string>(CHAPTER_FILTER.key) ?? 'all';
      const raw = (data.chaptersByComicId ?? []).filter((c) => filter === 'all' || c.type === filter);
      raw.sort((a, b) => {
        if (a.type !== b.type) return a.type < b.type ? 1 : -1;
        return (Number.parseFloat(b.serial) || 0) - (Number.parseFloat(a.serial) || 0);
      });
      return raw.map((c) => ({
        url: `${manga.url}/chapter/${c.id}`,
        name: c.type === 'chapter' ? `第 ${c.serial} 話` : c.type === 'book' ? `第 ${c.serial} 卷` : c.serial,
        scanlator: `${c.size}P`,
        uploadedAt: Date.parse(c.dateCreated),
        number: Number.parseFloat(c.serial) || -1,
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const data = await query(
        'imagesByChapterId',
        'query imagesByChapterId($chapterId: ID!) { imagesByChapterId(chapterId: $chapterId) { kid } }',
        { chapterId: idOf(chapter.url) },
      );
      return (data.imagesByChapterId ?? []).map((image, index) => ({
        index,
        imageUrl: `${BASE_URL}/api/image/${image.kid}`,
      }));
    },
    imageHeaders: () => ({ ...headers, Accept: '*/*' }),
    getWebUrl: (item) => `${BASE_URL}${item.url}${item.url.includes('/chapter/') ? '/images/all' : ''}`,
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/comic\/\d+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase() !== hostOf(BASE_URL)) return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
