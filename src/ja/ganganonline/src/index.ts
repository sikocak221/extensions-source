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
import { USER_AGENT, parseDate } from './common/utils';

const BASE_URL = 'https://www.ganganonline.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const CATEGORIES: [string, string][] = [
  ['連載作品', '/rensai'],
  ['連載終了作品', '/finish'],
  ['ガンガンpixiv', '/pixiv'],
  ['ガンガンGA', '/ga'],
];

interface Title {
  titleId: number;
  header?: string;
  name?: string;
  imageUrl?: string | null;
  isNovel?: boolean | null;
}

async function nextData<T>(url: string): Promise<{ data: T; url: string }> {
  const res = await http.get(url, { headers });
  const doc = html.load(res.body, { baseUrl: res.url });
  const script = doc.selectFirst('script#__NEXT_DATA__');
  if (!script) throw new Error('__NEXT_DATA__ not found');
  const json = JSON.parse(script.html()) as { props: { pageProps: { data: T } } };
  return { data: json.props.pageProps.data, url: res.url };
}

const toManga = (t: Title): MangaSummary => ({
  url: `/title/${t.titleId}`,
  title: (t.header ?? t.name ?? '') as string,
  thumbnailUrl: t.imageUrl ? BASE_URL + t.imageUrl : undefined,
});

async function list(url: string): Promise<MangaPage> {
  const { data } = await nextData<{
    titleSections?: { titles: Title[] }[];
    sections?: { titleLinks: Title[] }[];
    ongoingTitleSection?: { titles: Title[] };
    finishedTitleSection?: { titles: Title[] };
    ganganTitles?: Title[];
  }>(url);
  let titles: Title[] = [];
  if (url.includes('/search/result')) titles = (data.sections ?? []).flatMap((s) => s.titleLinks);
  else if (url.includes('/rensai') || url.includes('/finish'))
    titles = (data.titleSections ?? []).flatMap((s) => s.titles);
  else if (url.includes('/ga'))
    titles = [...(data.ongoingTitleSection?.titles ?? []), ...(data.finishedTitleSection?.titles ?? [])];
  else if (url.includes('/pixiv')) titles = data.ganganTitles ?? [];
  return { items: titles.filter((t) => t.isNovel !== true).map(toManga), hasNextPage: false };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    getPopular: () => list(`${BASE_URL}/rensai`),
    getFilters(): Filter[] {
      return [
        {
          type: 'select',
          id: 'category',
          label: 'Category',
          options: CATEGORIES.map(([label, value]) => ({ value, label })),
        },
      ];
    },
    search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) return list(`${BASE_URL}/search/result?keyword=${encodeURIComponent(query)}`);
      const category = typeof filters.category === 'string' && filters.category ? filters.category : '/rensai';
      return list(`${BASE_URL}${category}`);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { data } = await nextData<{
        default: { titleName: string; author: string; description: string; imageUrl: string };
      }>(`${BASE_URL}${manga.url}`);
      const d = data.default;
      return {
        url: manga.url,
        title: d.titleName,
        author: d.author,
        description: d.description,
        thumbnailUrl: BASE_URL + d.imageUrl,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { data, url } = await nextData<{
        default: {
          chapters: {
            id: number | null;
            status: number | null;
            mainText: string;
            subText?: string | null;
            publishingPeriod?: string | null;
          }[];
        };
      }>(`${BASE_URL}${manga.url}`);
      const mangaUrl = url.split('/chapter')[0]!.replace(BASE_URL, '');
      return data.default.chapters
        .filter((c) => c.status == null || c.status >= 4)
        .map((c) => ({
          url: `${mangaUrl}/chapter/${c.id}`,
          name: c.mainText + (c.subText ? ` - ${c.subText}` : ''),
          uploadedAt: parseDate(c.publishingPeriod?.split('〜')[0], 'yyyy.M.d'),
        }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { data } = await nextData<{
        pages: { image?: { imageUrl: string } | null; linkImage?: { imageUrl: string } | null }[];
      }>(`${BASE_URL}${chapter.url}`);
      return data.pages
        .map((p) => (p.image ?? p.linkImage)?.imageUrl)
        .filter((u): u is string => !!u)
        .map((u, index) => ({ index, imageUrl: BASE_URL + u }));
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
