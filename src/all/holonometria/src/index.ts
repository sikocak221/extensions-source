import { type Chapter, type HtmlElement, type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://holoearth.com';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const MANGA = ['manga', 'gambar', '漫画'];
const SCRIPT = ['script', 'naskah', '脚本'];

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers: HEADERS });
  return html.load(response.body, { baseUrl: response.url });
}

function personOf(info: string[], words: string[]): string | undefined {
  const line = info.find((desc) => words.some((w) => desc.toLowerCase().includes(w.toLowerCase())));
  if (!line) return undefined;
  const afterFull = line.includes('：') ? line.slice(line.indexOf('：') + 1) : line;
  const afterColon = afterFull.includes(':') ? afterFull.slice(afterFull.indexOf(':') + 1) : afterFull;
  return afterColon.trim().replace(/&amp;/g, '&');
}

export default defineExtension({
  createSource: ({ lang }) => {
    const langPath = lang === 'ja' ? '' : `${lang}/`;

    async function listing(): Promise<MangaSummary[]> {
      const document = await fetchDocument(`${BASE_URL}/${langPath}alt/holonometria/manga/`);
      return document.select('.manga__item').map((element) => {
        const link = element.selectFirst('a');
        return {
          url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
          title: element
            .select('.manga__title')
            .map((e) => e.text())
            .join(' '),
          thumbnailUrl: element.selectFirst('img')?.absUrl('src'),
        };
      });
    }

    return {
      baseUrl: BASE_URL,
      getPopular: async () => ({ items: await listing(), hasNextPage: false }),
      search: async (query) => {
        const q = query.trim().toLowerCase();
        return { items: (await listing()).filter((m) => m.title.toLowerCase().includes(q)), hasNextPage: false };
      },
      getMangaDetails: async (manga) => {
        const document = await fetchDocument(BASE_URL + manga.url);
        const info = (document.selectFirst('.manga-detail__person')?.html() ?? '').split(/<br\s*\/?>/i);
        return {
          url: manga.url,
          title:
            document
              .select('.alt-nav__met-sub-link.is-current')
              .map((e) => e.text())
              .join(' ') || manga.title,
          thumbnailUrl: document.selectFirst('.manga-detail__thumb img')?.absUrl('src') || manga.thumbnailUrl,
          description: document
            .select('.manga-detail__caption')
            .map((e) => e.text())
            .join(' '),
          author: personOf(info, MANGA),
          artist: personOf(info, SCRIPT),
          status: 'unknown',
        };
      },
      getChapters: async (manga): Promise<Chapter[]> => {
        const document = await fetchDocument(BASE_URL + manga.url);
        return document
          .select('.manga-detail__list .manga-detail__list-item')
          .map((element): Chapter => {
            const link = element.selectFirst('a');
            const date = element.selectFirst('.manga-detail__list-date')?.text();
            return {
              url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
              name: element
                .select('.manga-detail__list-title')
                .map((e) => e.text())
                .join(' '),
              uploadedAt: parseDate(date, 'yyyy.M.d') ?? parseDate(date, 'd.M.yyyy'),
            };
          })
          .reverse();
      },
      getPages: async (chapter) => {
        const document = await fetchDocument(BASE_URL + chapter.url);
        return document
          .select('.manga-detail__swiper-wrapper img')
          .map((img) => img.absUrl('src'))
          .reverse()
          .map((imageUrl, index) => ({ index, imageUrl }));
      },
      imageHeaders: () => HEADERS,
      resolveUrl: (url) => (hostOf(url) === hostOf(BASE_URL) ? { url: relativeUrl(url), title: '' } : null),
      getWebUrl: (item) => BASE_URL + item.url,
    };
  },
});
