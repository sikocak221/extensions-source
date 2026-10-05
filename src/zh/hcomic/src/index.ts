import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://h-comic.com';
const IMG_URL = 'https://h-comic.link/api';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const SORTS: [string, string][] = [
  ['最近更新', ''],
  ['隨機排序', '/random'],
];
const TAGS: [string, string][] = [
  ['全彩', 'full color'],
  ['巨乳', 'big breasts'],
  ['黑絲 / 白襪', 'stockings'],
  ['NTR', 'netorare'],
  ['足交 / 腳交', 'footjob'],
  ['女學生', 'schoolgirl uniform'],
  ['眼鏡控', 'glasses'],
  ['口交', 'blowjob'],
  ['正太控', 'shotacon'],
  ['亂倫', 'incest'],
  ['熟女 / 人妻', 'milf'],
  ['同志 BL', 'yaoi'],
  ['黑肉', 'dark skin'],
  ['泳裝', 'swimsuit'],
  ['手淫', 'masturbation'],
  ['肌肉', 'muscle'],
  ['姐姐 / 妹妹', 'sister'],
  ['捆綁', 'bondage'],
  ['調教', 'femdom'],
  ['催眠', 'mind control'],
  ['露出', 'exhibitionism'],
  ['群交', 'group'],
  ['肛交', 'anal'],
  ['獸交', 'bestiality'],
];

interface Tag {
  type: string;
  nameZH: string;
}

interface HManga {
  mediaId: string;
  title: string;
  numPages: number;
  author: string;
  tags: Tag[];
  timestamp: number;
  source: string;
}

type Data = unknown[];
type Obj = Record<string, number>;

// SvelteKit's `__data.json` is a flat array where objects hold indexes into it.
function parseManga(data: Data, structIdx: number): HManga {
  const struct = data[structIdx] as Obj;
  const at = (i: number) => data[i];
  const titleObj = at(struct.title!) as Obj;
  const allTags = (at(struct.tags!) as number[]).map((tagIdx): Tag => {
    const t = at(tagIdx) as Obj;
    const name = at(t.name!) as string;
    return { type: at(t.type!) as string, nameZH: t.name_zh !== undefined ? (at(t.name_zh) as string) : name };
  });
  return {
    mediaId: at(struct.media_id!) as string,
    title: at(titleObj.display!) as string,
    numPages: at(struct.num_pages!) as number,
    author: allTags
      .filter((t) => t.type === 'artist')
      .map((t) => t.nameZH)
      .join(', '),
    tags: allTags.filter((t) => t.type !== 'artist'),
    timestamp: at(struct.upload_date!) as number,
    source: at(struct.comic_source!) as string,
  };
}

function nodeData(body: { nodes: ({ data?: Data } | null)[] }): Data {
  const data = body.nodes[1]?.data;
  if (!data) throw new Error('Unexpected data');
  return data;
}

async function fetchData(path: string) {
  const response = await http.get<{ nodes: ({ data?: Data } | null)[] }>(`${BASE_URL}${path}`, {
    headers,
    responseType: 'json',
  });
  return nodeData(response.body);
}

async function mangaList(path: string, page: number): Promise<MangaPage> {
  const data = await fetchData(path);
  const indexes = data[0] as Obj;
  const comicIndexes = data[indexes.comics!] as number[];
  const totalPages = indexes.pages !== undefined ? ((data[(data[indexes.pages] as Obj).pages!] as number) ?? 1) : 1;
  return { items: comicIndexes.map((i) => summary(parseManga(data, i))), hasNextPage: page < totalPages };
}

function summary(manga: HManga): MangaSummary {
  return {
    url: `/comics/${encodeURIComponent(manga.title)}/1`,
    title: manga.title,
    thumbnailUrl: `${IMG_URL}/${manga.source}/${manga.mediaId}`,
  };
}

function filterTags(manga: HManga, type: string): string {
  const suffix = manga.tags
    .filter((t) => t.type === type)
    .map((t) => t.nameZH)
    .join('、');
  const prefix = type === 'parody' ? '原著' : type === 'character' ? '角色' : type === 'group' ? '製作組' : '';
  return suffix ? `**${prefix}：** ${suffix}\n` : '';
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    // The popular list is the site's random one.
    async getPopular(): Promise<MangaPage> {
      const result = await mangaList('/random/__data.json', 0);
      return { items: result.items, hasNextPage: true };
    },
    getLatest: (page) => mangaList(`/__data.json?page=${page}`, page),
    async search(query, page, filters: FilterState): Promise<MangaPage> {
      const sort = typeof filters.sort === 'string' ? filters.sort : '';
      const tags = TAGS.filter(([, value]) => filters[`tag.${value}`] === true)
        .map(([, value]) => value)
        .join(',');
      return mangaList(
        `${sort}/__data.json?tag=${encodeURIComponent(tags)}&q=${encodeURIComponent(query)}&page=${page}`,
        page,
      );
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: '排序',
        options: SORTS.map(([label, value]) => ({ label, value })),
        default: '',
      },
      {
        type: 'group',
        id: 'tags',
        label: '人氣標籤',
        filters: TAGS.map(([label, value]) => ({ type: 'checkbox', id: `tag.${value}`, label })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const data = await fetchData(`${manga.url}/__data.json`);
      const item = parseManga(data, 1);
      return {
        ...summary(item),
        author: item.author || undefined,
        description:
          filterTags(item, 'parody') +
          filterTags(item, 'character') +
          filterTags(item, 'group') +
          `**页数：** ${item.numPages}`,
        genres: item.tags.filter((t) => t.type === 'tag').map((t) => t.nameZH),
        status: 'completed',
      };
    },
    // Every comic is a single chapter; the page list comes from the same data.
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const item = parseManga(await fetchData(`${manga.url}/__data.json`), 1);
      return [
        {
          url: `${manga.url}#${item.source}/${item.mediaId}/${item.numPages}`,
          name: item.title,
          scanlator: item.tags.find((t) => t.type === 'category')?.nameZH || undefined,
          uploadedAt: item.timestamp * 1000,
        },
      ];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [source, mediaId, count] = (chapter.url.split('#')[1] ?? '').split('/');
      return Array.from({ length: Number(count) }, (_, index) => ({
        index,
        imageUrl: `${IMG_URL}/${source}/${mediaId}/pages/${index + 1}`,
      }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url.split('#')[0]}`,
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/comics\/[^/?#]+\/1)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
