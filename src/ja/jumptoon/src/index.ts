import {
  type Chapter,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type TileOp,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://jumptoon.com';
const API_URL = 'https://api.g.jumptoon.com/query';
const HIDE_LOCKED = 'hide_locked';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Origin: BASE_URL };

const ALGORITHMS: Record<string, { splitWidth: number; paddingWidth: number; blankWidth: number }> = {
  V1: { splitWidth: 12, paddingWidth: 3, blankWidth: 3 },
  V2: { splitWidth: 20, paddingWidth: 15, blankWidth: 1 },
};

const GENRES: Record<string, string> = {
  BATTLE_ACTION: 'バトル・アクション',
  BOY: '少年',
  BUSINESS: 'お仕事もの',
  COMEDY: 'ギャグ・コメディ',
  EVERYDAY: '日常',
  FANTASY_SF: 'ファンタジー・SF',
  FEMALE: '女性',
  GIRL: '少女',
  GOURMET: 'グルメ・料理',
  HISTORY: '歴史・時代物',
  HORROR: 'ホラー・オカルト',
  HUMAN_DRAMA: 'ヒューマンドラマ',
  LOVE: '恋愛',
  LOVE_COMEDY: 'ラブコメ',
  MYSTERY_SUSPENSE: 'ミステリー・サスペンス',
  SCHOOL: '青春・学園',
  SPORTS: 'スポーツ',
  UNDERGROUND_YANKEE: 'アングラ・ヤンキー',
  YOUTH: '青年',
};

const SERIES = 'id name seriesThumbnailV2ImageUrl';
const RANKING_QUERY = `query SeriesOverallRankingPage { rankingFeedV2(rankingFeedType: OVERALL_V2) { seriesList(publishDestinationType: WEB, first: 30) { series { ${SERIES} } } } }`;
const LATEST_QUERY = `query TopPageData { dailyUpdatedSeriesFeedList(publishDestinationType: WEB, type: UPDATED_SERIES_FEED) { rankedSeriesList { series { ${SERIES} } } } }`;
const SEARCH_QUERY = `query SearchSeries($q: String!, $offset: Int, $first: Int) { searchSeries(q: $q, offset: $offset, first: $first, publishDestinationType: WEB) { totalCount seriesList { ${SERIES} pairedSeries { ${SERIES} } } } }`;
const DETAILS_QUERY = `query SeriesPageData($seriesId: ID!, $hasSession: Boolean!) {
  series(id: $seriesId) { name description copyright seriesThumbnailV2ImageUrl seriesStatusType isSuspended genreTypes authorList { author { name } } }
  seriesEpisodeList(seriesId: $seriesId, orderDirectionType: DESC) { edges { node { id seriesId number notation title publishStartDatetime offerType userSeriesEpisode @include(if: $hasSession) { isPurchased rentalFinishedAt } } } }
  seriesComicsList(seriesId: $seriesId, orderDirectionType: DESC) { edges { node { id seriesId number notation publishStartDatetime previewPageCount userSeriesComics { isPurchased } } } }
}`;
const content = (op: string, field: string) =>
  `query ${op}($seriesId: ID!, $id: IntID!) { content: ${field}(id: $id, seriesId: $seriesId) { seriesId number scrambleAlgorithmType pageList { width imageUrl } } }`;
const CONTENT_QUERIES = {
  episodes: ['SeriesEpisodePageData', content('SeriesEpisodePageData', 'seriesEpisodeContent')],
  comics: ['SeriesComicsViewerContent', content('SeriesComicsViewerContent', 'seriesComicsContent')],
  preview: [
    'SeriesComicsTrialPreviewContent',
    content('SeriesComicsTrialPreviewContent', 'seriesComicsPreviewContent'),
  ],
} as const;

async function gql<T>(operationName: string, query: string, variables: unknown = undefined): Promise<T> {
  const res = await http.post<{ data?: T; errors?: { message: string }[] }>(
    API_URL,
    { json: { operationName, query, variables } },
    { headers, responseType: 'json' },
  );
  if (res.body.errors?.length) throw new Error(res.body.errors[0]!.message);
  return res.body.data as T;
}

interface Series {
  id: string;
  name: string;
  seriesThumbnailV2ImageUrl?: string | null;
  pairedSeries?: Series | null;
}
const toManga = (s: Series): MangaSummary => ({
  url: `/${s.id}`,
  title: s.name,
  thumbnailUrl: s.seriesThumbnailV2ImageUrl ?? undefined,
});

function imageSize(bytes: Uint8Array): [number, number] | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return [view.getUint32(16), view.getUint32(20)];
  if (bytes[0] === 0x52 && bytes[8] === 0x57) {
    const chunk = String.fromCharCode(...bytes.subarray(12, 16));
    if (chunk === 'VP8 ') return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true);
      return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
    }
    if (chunk === 'VP8X')
      return [
        1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)),
        1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)),
      ];
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let i = 2; i + 9 < bytes.length;) {
      if (bytes[i] !== 0xff) return undefined;
      const marker = bytes[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return [view.getUint16(i + 7), view.getUint16(i + 5)];
      i += 2 + view.getUint16(i + 2);
    }
  }
  return undefined;
}

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED, label: 'Hide Locked Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    async getPopular(): Promise<MangaPage> {
      const r = await gql<{ rankingFeedV2: { seriesList: { series: Series }[] } }>(
        'SeriesOverallRankingPage',
        RANKING_QUERY,
      );
      return { items: r.rankingFeedV2.seriesList.map((s) => toManga(s.series)), hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      const r = await gql<{ dailyUpdatedSeriesFeedList: { rankedSeriesList: { series: Series }[] }[] }>(
        'TopPageData',
        LATEST_QUERY,
      );
      const seen = new Set<string>();
      const items: MangaSummary[] = [];
      for (const feed of r.dailyUpdatedSeriesFeedList)
        for (const s of feed.rankedSeriesList) {
          const m = toManga(s.series);
          if (!seen.has(m.url)) {
            seen.add(m.url);
            items.push(m);
          }
        }
      return { items, hasNextPage: false };
    },
    async search(query: string, page: number): Promise<MangaPage> {
      const r = await gql<{ searchSeries: { totalCount: number; seriesList: Series[] } }>(
        'SearchSeries',
        SEARCH_QUERY,
        {
          q: query,
          offset: (page - 1) * 24,
          first: 24,
        },
      );
      const items = r.searchSeries.seriesList.flatMap((s) => (s.pairedSeries ? [s, s.pairedSeries] : [s])).map(toManga);
      return { items, hasNextPage: page * 24 < r.searchSeries.totalCount };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const r = await gql<{
        series: {
          name: string;
          description?: string | null;
          copyright?: string | null;
          seriesThumbnailV2ImageUrl?: string | null;
          seriesStatusType?: string | null;
          isSuspended: boolean;
          genreTypes?: string[] | null;
          authorList?: { author: { name: string } }[] | null;
        };
      }>('SeriesPageData', DETAILS_QUERY, { seriesId: manga.url.slice(1), hasSession: false });
      const s = r.series;
      const status: MangaStatus = s.isSuspended
        ? 'hiatus'
        : s.seriesStatusType === 'COMPLETED' || s.seriesStatusType === 'ONE_SHOT'
          ? 'completed'
          : 'ongoing';
      return {
        url: manga.url,
        title: s.name,
        description: [s.description, s.copyright].filter(Boolean).join('\n\n'),
        thumbnailUrl: s.seriesThumbnailV2ImageUrl ?? manga.thumbnailUrl,
        author: s.authorList?.map((a) => a.author.name).join(', ') || undefined,
        genres: s.genreTypes?.map((g) => GENRES[g] ?? g),
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED) === true;
      const r = await gql<{
        seriesEpisodeList: {
          edges: {
            node: {
              id: string;
              seriesId: string;
              number?: string | null;
              notation: string;
              title?: string | null;
              publishStartDatetime?: string | null;
              offerType?: string | null;
            };
          }[];
        };
        seriesComicsList: {
          edges: {
            node: {
              id: string;
              seriesId: string;
              number?: string | null;
              notation: string;
              publishStartDatetime?: string | null;
              previewPageCount?: string | null;
              userSeriesComics?: { isPurchased: boolean } | null;
            };
          }[];
        };
      }>('SeriesPageData', DETAILS_QUERY, { seriesId: manga.url.slice(1), hasSession: false });
      const chapters: Chapter[] = [];
      for (const { node: e } of r.seriesEpisodeList.edges) {
        const locked = e.offerType !== 'FREE';
        if (hideLocked && locked) continue;
        const lock = locked ? '🔒 ' : '';
        chapters.push({
          url: `/${e.seriesId}/episodes/${e.id}`,
          name: e.title ? `${lock}${e.notation} - ${e.title}` : `${lock}${e.notation}`,
          number: e.number ? Number(e.number) : undefined,
          uploadedAt: e.publishStartDatetime ? Number(e.publishStartDatetime) : undefined,
        });
      }
      for (const { node: v } of r.seriesComicsList.edges) {
        const locked = v.userSeriesComics?.isPurchased !== true;
        if (hideLocked && locked) continue;
        const preview = locked && Number(v.previewPageCount ?? 0) > 0;
        chapters.push({
          url: `/${v.seriesId}/${preview ? 'preview' : 'comics'}/${v.id}`,
          name: `${locked ? '🔒 ' : ''}${preview ? '(Preview) ' : ''}${v.notation}`,
          number: v.number ? Number(v.number) : undefined,
          uploadedAt: v.publishStartDatetime ? Number(v.publishStartDatetime) : undefined,
        });
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [, seriesId, type, id] = chapter.url.split('/') as [string, string, keyof typeof CONTENT_QUERIES, string];
      const [op, query] = CONTENT_QUERIES[type];
      let r: {
        content: {
          seriesId: string;
          number: string;
          scrambleAlgorithmType: string;
          pageList: { width: string; imageUrl: string }[];
        };
      };
      try {
        r = await gql(op, query, { seriesId, id });
      } catch (e) {
        if (e instanceof Error && e.message === 'RequiredPurchase')
          throw new Error('Log in via WebView and rent or purchase this chapter to read.');
        throw e;
      }
      const c = r.content;
      let seed = 0;
      for (const ch of `${c.seriesId}:${c.number}`) seed += ch.charCodeAt(0);
      return c.pageList.map((p, index) => ({
        index,
        imageUrl: `${p.imageUrl}#${c.scrambleAlgorithmType}:${seed}:${p.width}`,
      }));
    },
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const fragment = (page.imageUrl ?? '').split('#')[1];
      if (!fragment || !fragment.includes(':')) return {};
      const [type, seedText, widthText] = fragment.split(':') as [string, string, string];
      const algo = ALGORITHMS[type];
      const size = imageSize(bytes);
      if (!algo || !size) return {};
      const [imgWidth, height] = size;
      const cell = algo.splitWidth + algo.blankWidth + 2 * algo.paddingWidth;
      const columns = Math.floor(imgWidth / cell);
      const remainder = Number(widthText) % algo.splitWidth;
      const order = Array.from({ length: columns }, (_, i) => i);
      let state = Number(seedText);
      for (let i = remainder !== 0 ? columns - 1 : columns; i >= 2; i--) {
        state = (1664525 * state + 1013904223) % 4294967296;
        const j = state % i;
        const t = order[j]!;
        order[j] = order[i - 1]!;
        order[i - 1] = t;
      }
      const source = new Array<number>(columns).fill(0);
      for (const value of order) source[order[value]!] = value;
      const ops: TileOp[] = [];
      for (let dest = 0; dest <= columns; dest++) {
        const w = dest < columns ? algo.splitWidth : remainder;
        if (w === 0) continue;
        const srcX = (dest < columns ? source[dest]! : columns) * cell + algo.paddingWidth;
        ops.push({ sx: srcX, sy: 0, w, h: height, dx: dest * algo.splitWidth, dy: 0 });
      }
      return { tiles: { width: columns * algo.splitWidth + remainder, height, ops } };
    },
    getWebUrl(item) {
      const parts = item.url.split('/');
      return parts.length >= 4
        ? `${BASE_URL}/series/${parts[1]}/${parts[2] === 'preview' ? 'comics' : parts[2]}/${parts[3]}/`
        : `${BASE_URL}/series/${parts[1]}/`;
    },
  }),
});
