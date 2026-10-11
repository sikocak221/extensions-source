import { type Chapter, type MangaSummary, type Page, defineExtension } from '@matane/extension-sdk';
import { USER_AGENT, parseDate } from './common/utils';

const BASE_URL = 'https://www.commitstrip.com';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const LOGO: Record<string, string> = { en: 'https://i.imgur.com/HODJlt9.jpg', fr: 'https://i.imgur.com/I7ps9zS.jpg' };
const AUTHOR: Record<string, string> = { en: 'Mark Nightingale', fr: 'Thomas Gx' };
const ARTIST = 'Etienne Issartial';
const SUMMARY: Record<string, string> = {
  en: 'The blog relating the daily life of web agency developers.',
  fr: 'Le blog qui raconte la vie des codeurs',
};
const NOTE = '\n\nNote: This entry includes all the chapters published in';
const CURRENT_YEAR = new Date().getUTCFullYear();

export default defineExtension({
  createSource: ({ lang }) => {
    const siteLang = lang === 'fr' ? 'fr' : 'en';
    const name = 'Commit Strip';

    const years = async (): Promise<MangaSummary[]> => {
      // recent years without any strip answer 404: start at the newest year that has some
      let latest = CURRENT_YEAR;
      for (; latest > CURRENT_YEAR - 6; latest--) {
        try {
          await http.get(`${BASE_URL}/${siteLang}/${latest}/?`, { headers: HEADERS });
          break;
        } catch {
          // try the previous year
        }
      }
      return Array.from({ length: latest - 2012 + 1 }, (_, i) => latest - i).map((year) => ({
        url: `/${siteLang}/${year}`,
        title: `${name} (${year})`,
        thumbnailUrl: LOGO[siteLang],
      }));
    };

    return {
      baseUrl: BASE_URL,
      getPopular: async () => ({ items: await years(), hasNextPage: false }),
      search: async (query) => ({
        items: (await years()).filter((m) => m.title.toLowerCase().includes(query.toLowerCase())),
        hasNextPage: false,
      }),
      getMangaDetails: async (manga) => {
        const year = Number(/(\d{4})\/?$/.exec(manga.url)?.[1] ?? CURRENT_YEAR);
        return {
          url: manga.url,
          title: `${name} (${year})`,
          thumbnailUrl: LOGO[siteLang],
          author: AUTHOR[siteLang],
          artist: ARTIST,
          status: year !== CURRENT_YEAR ? 'completed' : 'ongoing',
          description: `${SUMMARY[siteLang]} ${NOTE} ${year}`,
        };
      },
      getChapters: async (manga): Promise<Chapter[]> => {
        const base = `${BASE_URL}${manga.url}`;
        // years without any strip (e.g. 2023) answer 404
        let first: { status: number; body: string; url: string };
        try {
          first = await http.get(`${base}/?`, { headers: HEADERS });
        } catch (error) {
          if (String(error).includes('404')) return [];
          throw error;
        }
        const document = html.load(first.body, { baseUrl: first.url });
        const pagesText = document.selectFirst('.wp-pagenavi .pages')?.text() ?? '1';
        const numbers = pagesText.match(/\d+/g);
        const pages = numbers ? Number(numbers[numbers.length - 1]) : 1;
        const seen = new Set<string>();
        const chapters: Chapter[] = [];
        for (let page = 1; page <= pages; page++) {
          const doc =
            page === 1
              ? document
              : html.load((await http.get(`${base}/page/${page}/?`, { headers: HEADERS })).body, { baseUrl: BASE_URL });
          for (const link of doc.select('.excerpt a')) {
            const href = link.attr('href') ?? '';
            const path = `/${siteLang}${href.replace(/^https?:\/\/[^/]+/, '')}`;
            if (seen.has(path)) continue;
            seen.add(path);
            const date = /\d{4}\/\d{2}\/\d{2}/.exec(path)?.[0];
            chapters.push({
              url: path,
              name:
                link
                  .select('span')
                  .map((s) => s.text())
                  .join(' ')
                  .trim() || path,
              uploadedAt: parseDate(date, 'yyyy/MM/dd'),
            });
          }
        }
        const total = chapters.length;
        return chapters.map((chapter, index) => ({ ...chapter, number: total - index }));
      },
      getPages: async (chapter): Promise<Page[]> => {
        const response = await http.get(BASE_URL + chapter.url, { headers: HEADERS });
        const document = html.load(response.body, { baseUrl: response.url });
        const imageUrl = document.selectFirst('.entry-content p img')?.absUrl('src') ?? '';
        return imageUrl ? [{ index: 0, imageUrl }] : [];
      },
      imageHeaders: () => HEADERS,
      getWebUrl: (item) =>
        item.url.startsWith('/') ? `${BASE_URL}${item.url}${/\d{4}$/.test(item.url) ? '/?' : ''}` : item.url,
    };
  },
});
