import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate } from './common/utils';

const BASE_URL = 'https://comic.naver.com';
const MOBILE_URL = 'https://m.comic.naver.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

type SourceType = 'webtoon' | 'bestChallenge' | 'challenge';

interface PageInfo {
  nextPage: number;
}

interface Author {
  name: string;
}

interface MangaDto {
  thumbnailUrl: string;
  titleName: string;
  titleId: number;
  finished?: boolean;
  rest?: boolean;
  communityArtists?: Author[];
  synopsis?: string;
}

interface ChapterDto {
  serviceDateDescription: string;
  subtitle: string;
  no: number;
}

async function api<T>(url: string): Promise<T> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return JSON.parse(response.body) as T;
}

const titleId = (manga: MangaSummary) => /titleId=(\d+)/.exec(manga.url)?.[1] ?? '';

// Dates are "yy.M.d" in Seoul time; today's chapters show the time of day instead.
function chapterDate(text: string): number | undefined {
  if (text.includes(':')) return Date.now();
  const utc = parseDate(text, 'yy.M.d');
  return utc === undefined ? undefined : utc - 9 * 3_600_000;
}

export default defineExtension({
  createSource: (info) => {
    const type: SourceType = info.key === 'best-challenge' ? 'bestChallenge' : (info.key as SourceType);
    const isChallenge = type !== 'webtoon';

    const toSummary = (dto: MangaDto): MangaSummary => ({
      url: `/${type}/list?titleId=${dto.titleId}`,
      title: dto.titleName,
      thumbnailUrl: dto.thumbnailUrl,
    });

    async function list(order: 'VIEW' | 'UPDATE', sort: 'ALL_READER' | 'UPDATE', page: number): Promise<MangaPage> {
      if (isChallenge) {
        const result = await api<{ pageInfo?: PageInfo; list: MangaDto[] }>(
          `/api/${type}/list?order=${order}&page=${page}`,
        );
        const items = result.list.map(toSummary);
        return { items, hasNextPage: result.pageInfo ? result.pageInfo.nextPage !== 0 : items.length > 0 };
      }
      const response = await http.get(`${MOBILE_URL}/${type}/weekday?sort=${sort}`, { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      const items = document.select(".list_toon > [class='item ']").flatMap((element): MangaSummary[] => {
        const href = element.selectFirst('a')?.absUrl('href');
        const title = element.selectFirst('strong')?.text();
        const id = /titleId=(\d+)/.exec(href ?? '')?.[1];
        if (!id || !title) return [];
        return [
          {
            url: `/${type}/list?titleId=${id}`,
            title,
            thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
          },
        ];
      });
      return { items, hasNextPage: false };
    }

    return {
      baseUrl: BASE_URL,
      getPopular: (page) => list('VIEW', 'ALL_READER', page),
      getLatest: (page) => list('UPDATE', 'UPDATE', page),
      async search(query, page): Promise<MangaPage> {
        const result = await api<{ pageInfo: PageInfo; searchList: MangaDto[] }>(
          `/api/search/${type}?keyword=${encodeURIComponent(query)}&page=${page}`,
        );
        return { items: result.searchList.map(toSummary), hasNextPage: result.pageInfo.nextPage !== 0 };
      },
      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const dto = await api<MangaDto>(`/api/article/list/info?titleId=${titleId(manga)}`);
        const status: MangaStatus = dto.rest ? 'hiatus' : dto.finished ? 'completed' : 'ongoing';
        return {
          url: manga.url,
          title: dto.titleName,
          description: dto.synopsis || undefined,
          thumbnailUrl: dto.thumbnailUrl,
          author: dto.communityArtists?.map((a) => a.name).join(', ') || undefined,
          status,
        };
      },
      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const id = titleId(manga);
        const chapters: Chapter[] = [];
        let page = 1;
        for (;;) {
          const result = await api<{ pageInfo: PageInfo; titleId: number; articleList: ChapterDto[] }>(
            `/api/article/list?titleId=${id}&page=${page}`,
          );
          for (const chapter of result.articleList) {
            chapters.push({
              url: `/${type}/detail?titleId=${result.titleId}&no=${chapter.no}`,
              name: chapter.subtitle,
              number: chapter.no,
              uploadedAt: chapterDate(chapter.serviceDateDescription),
            });
          }
          if (result.pageInfo.nextPage === 0) break;
          page = result.pageInfo.nextPage;
        }
        return chapters;
      },
      async getPages(chapter: Chapter): Promise<Page[]> {
        const response = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
        const document = html.load(response.body, { baseUrl: response.url });
        let urls = document.select('.wt_viewer img').map((img) => img.absUrl('src') || img.attr('src') || '');
        if (urls.length === 0)
          urls = document
            .select('.toon_view_lst img.toon_image')
            .map((img) => img.absUrl('data-src') || img.absUrl('src') || '');
        return urls.map((imageUrl, index) => ({ index, imageUrl }));
      },
      imageHeaders: () => headers,
      resolveUrl(url: string): MangaSummary | null {
        const match =
          /^https?:\/\/(?:m\.)?([^/?#]+)\/(webtoon|bestChallenge|challenge)\/(?:list|detail)\?(?:[^#]*&)?titleId=(\d+)/i.exec(
            url.trim(),
          );
        return match && match[1]!.toLowerCase() === hostOf(BASE_URL) && match[2] === type
          ? { url: `/${type}/list?titleId=${match[3]}`, title: '' }
          : null;
      },
      getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    };
  },
});
