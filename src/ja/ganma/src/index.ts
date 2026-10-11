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

const BASE_URL = 'https://ganma.jp';
const API_URL = `${BASE_URL}/api/graphql`;
const HIDE_LOCKED = 'hide_locked';

const HASH = {
  home: 'b65659a4a5689bac97168591122219b69ee089d840b0415ace241d0caebee900',
  magazineDetail: '9a1460a42f8d04c70b23bb9ad763d0dbef2eb6f5d05dafca98ca2be8a2bfe867',
  storyInfoList: 'acd460c52a231029d09e1ccca0aa06b99ae8163d5edff661cd64984ebb6dc4c3',
  magazineStoryForReader: '44e35d8af09515a315b06090723b72753828cf799466e3e1d722786844676617',
  magazinesByKeywordSearch: '55c7ca6cce30d8abdb0b32d00ad678ba37c03dd9b4851daf5ab5df5d41ce3ccc',
  finishedMagazines: 'ade49c46df5ef36f15485df70f656fb14f3261e90863fcd9ffbcc10baf30bc4c',
  serialMagazinesByDayOfWeek: 'f1778757c51a4f8b59d91032096dd11b2071cb4191ca1904744672c814d16a97',
};

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
const READER_UA = 'GanmaReader/10.11.0 Android';

const DAYS = [
  ['月曜日', 'MONDAY'],
  ['火曜日', 'TUESDAY'],
  ['水曜日', 'WEDNESDAY'],
  ['木曜日', 'THURSDAY'],
  ['金曜日', 'FRIDAY'],
  ['土曜日', 'SATURDAY'],
  ['日曜日', 'SUNDAY'],
  ['完結', 'finished'],
] as const;

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}
interface Item {
  alias: string;
  title: string;
  todaysJacketImageURL?: string | null;
  rectangleWithLogoImageURL?: string | null;
}

async function gql<T>(operationName: string, hash: string, variables: unknown, ua = DESKTOP_UA): Promise<T> {
  const res = await http.post<{ data?: T; errors?: { message: string }[] }>(
    API_URL,
    { json: { operationName, variables, extensions: { persistedQuery: { version: 1, sha256Hash: hash } } } },
    { headers: { 'User-Agent': ua, 'X-From': `${BASE_URL}/web`, Referer: `${BASE_URL}/web` }, responseType: 'json' },
  );
  if (!res.body.data) throw new Error(res.body.errors?.map((e) => e.message).join('; ') ?? 'GraphQL error');
  return res.body.data;
}

const toManga = (m: Item): MangaSummary => ({
  url: `/${m.alias}`,
  title: m.title,
  thumbnailUrl: m.todaysJacketImageURL ?? m.rectangleWithLogoImageURL ?? undefined,
});

let lastCursor: string | null = null;

async function dayOfWeek(day: string): Promise<MangaPage> {
  const r = await gql<{
    serialPerDayOfWeek: {
      panels: { edges: { node: { storyInfo: { magazine: Item } } }[]; pageInfo: PageInfo };
    };
  }>('serialMagazinesByDayOfWeek', HASH.serialMagazinesByDayOfWeek, { dayOfWeek: day, after: lastCursor });
  const p = r.serialPerDayOfWeek.panels;
  lastCursor = p.pageInfo.endCursor;
  return { items: p.edges.map((e) => toManga(e.node.storyInfo.magazine)), hasNextPage: p.pageInfo.hasNextPage };
}

const JST_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED, label: 'Hide Locked Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => ({ 'User-Agent': DESKTOP_UA, Referer: `${BASE_URL}/` }),
    async getPopular(): Promise<MangaPage> {
      const r = await gql<{ ranking: { totalRanking: Item[] } }>('home', HASH.home, {});
      return { items: r.ranking.totalRanking.map(toManga), hasNextPage: false };
    },
    async getLatest(page): Promise<MangaPage> {
      if (page === 1) lastCursor = null;
      const jst = new Date(Date.now() + 9 * 3600_000);
      return dayOfWeek(JST_DAYS[jst.getUTCDay()]!);
    },
    getFilters(): Filter[] {
      return [
        {
          type: 'select',
          id: 'category',
          label: '連載作品',
          options: DAYS.map(([label, value]) => ({ value, label })),
        },
      ];
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (page === 1) lastCursor = null;
      if (query.trim()) {
        const r = await gql<{ searchComic: { edges: { node: Item }[]; pageInfo: PageInfo } }>(
          'magazinesByKeywordSearch',
          HASH.magazinesByKeywordSearch,
          { keyword: query, after: lastCursor },
        );
        lastCursor = r.searchComic.pageInfo.endCursor;
        return {
          items: r.searchComic.edges.map((e) => toManga(e.node)),
          hasNextPage: r.searchComic.pageInfo.hasNextPage,
        };
      }
      const category = typeof filters.category === 'string' ? filters.category : 'MONDAY';
      if (category !== 'finished') return dayOfWeek(category);
      const r = await gql<{ magazinesByCategory: { magazines: { edges: { node: Item }[]; pageInfo: PageInfo } } }>(
        'finishedMagazines',
        HASH.finishedMagazines,
        { after: lastCursor },
      );
      const m = r.magazinesByCategory.magazines;
      lastCursor = m.pageInfo.endCursor;
      return { items: m.edges.map((e) => toManga(e.node)), hasNextPage: m.pageInfo.hasNextPage };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const r = await gql<{
        magazine: {
          title: string;
          authorName?: string;
          description?: string;
          isFinished?: boolean;
          squareWithLogoImageURL?: string;
          rectangleWithLogoImageURL?: string;
          magazineTags?: { name: string }[];
        };
      }>('magazineDetail', HASH.magazineDetail, { magazineIdOrAlias: manga.url.slice(1) });
      const m = r.magazine;
      return {
        url: manga.url,
        title: m.title,
        author: m.authorName ?? undefined,
        description: m.description ?? undefined,
        genres: m.magazineTags?.map((t) => t.name),
        status: m.isFinished ? 'completed' : 'ongoing',
        thumbnailUrl: m.squareWithLogoImageURL ?? m.rectangleWithLogoImageURL ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED) === true;
      const r = await gql<{
        magazine: {
          storyInfos: {
            edges: {
              node: {
                storyId: string;
                title: string;
                subtitle?: string | null;
                contentsRelease: number;
                isPurchased?: boolean | null;
                contentsAccessCondition?: { __typename: string; info?: { coins?: number | null } | null } | null;
                storyContents: { __typename: string };
              };
            }[];
          };
        };
      }>('storyInfoList', HASH.storyInfoList, { magazineIdOrAlias: manga.url.slice(1), first: 9999, after: null });
      return r.magazine.storyInfos.edges
        .map(({ node: n }) => {
          const cond = n.contentsAccessCondition;
          const locked =
            n.isPurchased === false &&
            (cond?.__typename !== 'FreeStoryContentsAccessCondition' ||
              (cond.info?.coins != null && cond.info.coins !== 0));
          const desktop = n.storyContents.__typename === 'StoryContents';
          return {
            locked,
            chapter: {
              url: `${manga.url}/${n.storyId}/${desktop ? 'd' : 'm'}`,
              name: `${locked ? '🪙 ' : ''}${n.subtitle ? `${n.title} ${n.subtitle}` : n.title}`,
              uploadedAt: n.contentsRelease,
            } as Chapter,
          };
        })
        .filter((c) => !hideLocked || !c.locked)
        .map((c) => c.chapter)
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [, alias, storyId, kind] = chapter.url.split('/');
      const r = await gql<{
        magazine: {
          storyContents: {
            pageImages?: { pageCount: number; pageImageBaseURL: string; pageImageSign: string } | null;
            error?: string | null;
            afterword?: { imageURL?: string | null } | null;
          };
        };
      }>(
        'magazineStoryForReader',
        HASH.magazineStoryForReader,
        { magazineIdOrAlias: alias, storyId },
        kind === 'd' ? DESKTOP_UA : READER_UA,
      );
      const c = r.magazine.storyContents;
      if (c.error != null || !c.pageImages) {
        throw new Error('Log in via WebView and get premium or purchase this chapter to read.');
      }
      const p = c.pageImages;
      const pages: Page[] = [];
      for (let i = 1; i <= p.pageCount; i++) {
        pages.push({ index: i - 1, imageUrl: `${p.pageImageBaseURL}${i}.jpg?${p.pageImageSign}&w=4999` });
      }
      const after = c.afterword?.imageURL;
      if (after) pages.push({ index: pages.length, imageUrl: `${after}${after.includes('?') ? '&' : '?'}w=4999` });
      return pages;
    },
    getWebUrl(item) {
      const parts = item.url.split('/');
      return parts.length >= 4
        ? `${BASE_URL}/web/reader/${parts[1]}/${parts[2]}/0`
        : `${BASE_URL}/web/magazine/${parts[1]}`;
    },
  }),
});
