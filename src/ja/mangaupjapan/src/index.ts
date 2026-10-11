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
import { USER_AGENT, hostOf, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://www.manga-up.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const rscHeaders = { ...headers, rsc: '1' };

const DAYS = [
  ['月曜日', 'mon'],
  ['火曜日', 'tue'],
  ['水曜日', 'wed'],
  ['木曜日', 'thu'],
  ['金曜日', 'fri'],
  ['土曜日', 'sat'],
  ['日曜日', 'sun'],
  ['完', 'end'],
].map(([label, value]) => ({ label: label!, value: value! }));

const load = async (url: string) => html.load((await http.get(url, { headers })).body, { baseUrl: url });

async function list(url: string): Promise<MangaPage> {
  const doc = await load(url);
  return {
    items: doc.select('div.grid > a').map((a) => ({
      url: relativeUrl(a.absUrl('href') ?? ''),
      title: a.selectFirst('div.line-clamp-2')?.text() ?? '',
      thumbnailUrl: a.selectFirst('img')?.absUrl('src'),
    })),
    hasNextPage: false,
  };
}

const chapterPageUrl = (chapter: Chapter) => {
  const [path = '', titleId = ''] = chapter.url.split('#');
  return `${BASE_URL}/titles/${titleId}/chapters/${path}`;
};

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => list(`${BASE_URL}/rankings/1`),
    getLatest: () => list(`${BASE_URL}/series`),
    getFilters: (): Filter[] => [{ type: 'select', id: 'category', label: 'Category', options: DAYS, default: 'mon' }],
    search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      if (query) return list(`${BASE_URL}/titles?word=${encodeURIComponent(query)}`);
      return list(`${BASE_URL}/series/${typeof filters.category === 'string' ? filters.category : 'mon'}`);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(BASE_URL + manga.url);
      const text = (sel: string) => selectIgnoreCase(doc, sel)[0]?.text();
      return {
        url: manga.url,
        title: doc.selectFirst('h2')?.text() ?? manga.title,
        thumbnailUrl: doc.selectFirst('section > img')?.absUrl('src') ?? manga.thumbnailUrl,
        author:
          doc
            .select('div.flex.flex-col.gap-2xsmall > div')
            .map((d) => d.text())
            .join(', ') || undefined,
        description: text('h2:contains(あらすじ) + div'),
        genres: doc.select('a[href*=/genres/]').map((a) => a.text()),
        status: text('div:contains(完結)') ? 'completed' : text('div:contains(更新)') ? 'ongoing' : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const response = await http.get(`${BASE_URL}${manga.url}?_rsc=1`, { headers: rscHeaders });
      const titleId = response.url.replace(/^https?:\/\/[^/]+/, '').split('/')[2] ?? '';
      const line = response.body.split('\n').find((l) => l.includes('"chapters":['));
      if (!line) return [];
      const json = line.slice(line.indexOf('"chapters":') + '"chapters":'.length).split(',"currentChapter"')[0]!;
      const chapters = JSON.parse(json) as {
        id: number;
        name: string;
        subName?: string | null;
        publishingStatus?: number | null;
      }[];
      return chapters
        .map((c) => ({
          url: `${c.id}#${titleId}`,
          name: `${c.publishingStatus !== 3 ? '🔒 (Preview) ' : ''}${c.subName ? `${c.subName} - ` : ''}${c.name}`,
        }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const body = (await http.get(`${chapterPageUrl(chapter)}?_rsc=1`, { headers: rscHeaders })).body;
      const line = body.split('\n').find((l) => l.includes('"pages":['));
      if (!line) return [];
      const json = `${line.slice(line.indexOf('"pages":') + '"pages":'.length).split('],"')[0]}]`;
      const pages = JSON.parse(json) as { content: { value?: { imageUrl?: string | null } | null } }[];
      return pages
        .map((p) => p.content.value?.imageUrl)
        .filter((u): u is string => !!u)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /\/titles\/(\d+)/.exec(url);
      return hostOf(url) === hostOf(BASE_URL) && match ? { url: `/titles/${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) => ('name' in item ? chapterPageUrl(item) : BASE_URL + item.url),
  }),
});
