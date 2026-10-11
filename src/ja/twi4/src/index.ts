import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, relativeUrl } from './common/utils';

const BASE_URL = 'https://sai-zen-sen.jp/comics/twi4';
const HOST_ROOT = 'https://sai-zen-sen.jp';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const TITLE_REGEX = /^『(.+)』.+ \| ツイ４ \| 最前線$/;
const CHAPTER_REGEX = /^.+『(.+)』 #(\d+)$/;
const SECTIONS = '#lineup_recent > div > section, #lineup > div > section:not(.zadankai):not([id])';

const load = async (url: string) => html.load((await http.get(url, { headers })).body, { baseUrl: url });

/** The catalogue is small (under 50 manga): it is listed whole, and search filters it. */
async function catalog(): Promise<(MangaSummary & { completed: boolean; author?: string })[]> {
  const doc = await load(BASE_URL);
  const items: (MangaSummary & { completed: boolean; author?: string })[] = [];
  for (const section of doc.select(SECTIONS)) {
    const a = section.selectFirst('div.hgroup > h3 > a');
    if (!a) continue;
    items.push({
      url: relativeUrl(a.absUrl('href') ?? ''),
      title: a.text(),
      thumbnailUrl: section.selectFirst('div.figgroup > figure > a > img')?.absUrl('src'),
      author: section.selectFirst('div.hgroup > p')?.text(),
      completed: section.selectFirst('ul > li:last-child > em.is-completed') !== null,
    });
  }
  return items;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      return {
        items: (await catalog()).map(({ url, title, thumbnailUrl }) => ({ url, title, thumbnailUrl })),
        hasNextPage: false,
      };
    },
    async search(query: string): Promise<MangaPage> {
      const q = query.toLowerCase();
      const items = (await catalog())
        .filter((m) => m.title.toLowerCase().includes(q))
        .map(({ url, title, thumbnailUrl }) => ({ url, title, thumbnailUrl }));
      return { items, hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const [doc, entries] = await Promise.all([load(HOST_ROOT + manga.url), catalog().catch(() => [])]);
      const entry = entries.find((e) => e.url === manga.url);
      const title = doc.selectFirst('title')?.text() ?? '';
      let author: string | undefined;
      let artist: string | undefined;
      for (const staff of doc.select('#introduction > div > section > header > div > h3')) {
        const role = staff.selectFirst('small')?.text().replace('：', '').trim();
        const name = staff.selectFirst('span')?.text();
        if (!role || !name) continue;
        if (role === '作者') {
          author = name;
          artist = name;
        } else if (role === '原作') author = name;
        else if (role === '漫画') artist = name;
      }
      const status: MangaStatus = entry?.completed ? 'completed' : 'ongoing';
      return {
        url: manga.url,
        title: TITLE_REGEX.exec(title)?.[1] ?? (title || manga.title),
        thumbnailUrl: doc.selectFirst('#introduction > header > div > h2 > img')?.absUrl('src') ?? manga.thumbnailUrl,
        description: doc.selectFirst('#introduction > div > div > p')?.text(),
        author,
        artist,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(HOST_ROOT + manga.url);
      const chapters: Chapter[] = [];
      for (const li of doc.select('#backnumbers > div > ul > li')) {
        const a = li.selectFirst('a');
        if (!a) continue;
        const match = CHAPTER_REGEX.exec(a.text());
        const number = match?.[2];
        chapters.push({
          url: relativeUrl(a.absUrl('href') ?? ''),
          name: number ? `${Number(number)} - ${match![1]}` : a.text(),
          number: number ? Number(number) : undefined,
        });
      }
      return chapters.sort((a, b) => (b.number ?? -1) - (a.number ?? -1));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const doc = await load(HOST_ROOT + chapter.url);
      const img = doc.selectFirst('article.comic')?.selectFirst('div > div > p > img');
      return img ? [{ index: 0, imageUrl: img.absUrl('src') ?? '' }] : [];
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/sai-zen-sen\.jp\/comics\/twi4\/([^/?#]+)/.exec(url);
      const slug = match?.[1];
      return slug && !slug.endsWith('html') && !slug.startsWith('zadankai') && !slug.startsWith('others')
        ? { url: `/comics/twi4/${slug}/`, title: '' }
        : null;
    },
    getWebUrl: (item) => HOST_ROOT + item.url,
  }),
});
