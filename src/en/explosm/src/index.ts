import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate } from './common/utils';

const BASE_URL = 'https://explosm.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const THUMB = 'https://vhx.imgix.net/vitalyuncensored/assets/13ea3806-5ebf-4987-bcf1-82af2b689f77/S2E4_Still1.jpg';

interface Comic {
  slug: string;
  file?: string | null;
  file_static?: string | null;
  publish_at: string;
  author_name?: string | null;
}

// The Next.js data file of the archive: { year: { month: comics[] } }. Each year is an entry ("/comics#<year>"),
// chapter urls carry the image: "/comics/<slug>#<image url>".
async function archive(): Promise<Record<string, Record<string, Comic[]>>> {
  const page = html.load((await http.get(`${BASE_URL}/comics`, { headers })).body);
  const scripts = page.select('head > script');
  const src = scripts[scripts.length - 1]?.attr('src');
  if (!src) throw new Error('Cannot find the archive data');
  const path = src.replace('static', 'data').replace(/[^/]*$/, 'comics.json');
  return (
    await http.get<{ pageProps: { comicArchiveData: Record<string, Record<string, Comic[]>> } }>(`${BASE_URL}${path}`, {
      headers,
      responseType: 'json',
    })
  ).body.pageProps.comicArchiveData;
}

const entry = (year: string): MangaDetails => ({
  url: `/comics#${year}`,
  title: `C&H ${year}`,
  thumbnailUrl: THUMB,
  author: 'Explosm.net',
  status: 'unknown',
});

async function catalogue(): Promise<MangaPage> {
  const years = Object.keys(await archive()).reverse();
  return { items: years.map((y) => entry(y)), hasNextPage: false };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => catalogue(),
    search: async (query) => {
      const all = await catalogue();
      return { ...all, items: all.items.filter((m) => m.title.toLowerCase().includes(query.trim().toLowerCase())) };
    },
    getMangaDetails: async (manga: MangaSummary) => entry(manga.url.split('#')[1] ?? ''),
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const year = (await archive())[manga.url.split('#')[1] ?? ''];
      if (!year) throw new Error('Year not found');
      return Object.values(year)
        .flat()
        .map((comic, i) => {
          const image =
            comic.file_static ??
            (comic.file?.startsWith('http') ? comic.file : `https://files.explosm.net/comics/${comic.file}`);
          return {
            url: `/comics/${comic.slug}#${image}`,
            name: comic.slug,
            number: i + 1,
            scanlator: comic.author_name || undefined,
            uploadedAt: parseDate(comic.publish_at, 'yyyy-MM-dd HH:mm:ss'),
          };
        })
        .reverse();
    },
    getPages: async (chapter: Chapter): Promise<Page[]> => [
      { index: 0, imageUrl: chapter.url.slice(chapter.url.indexOf('#') + 1) },
    ],
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?explosm\.net\/comics#(\d{4})/i.exec(url.trim());
      return match ? { url: `/comics#${match[1]}`, title: `C&H ${match[1]}` } : null;
    },
    getWebUrl: (item) =>
      item.url.startsWith('/comics/') ? `${BASE_URL}${item.url.split('#')[0]}` : `${BASE_URL}${item.url}`,
  }),
});
