import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type SourceInfo,
  defineExtension,
} from '@matane/extension-sdk';
import { parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://global.toomics.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const SITE_LANG: Record<string, string> = { 'zh-Hans': 'sc', 'zh-Hant': 'tc', 'es-419': 'mx', 'pt-BR': 'por' };
const DATE_PATTERN: Record<string, string> = {
  'zh-Hans': 'yyyy.M.d',
  'zh-Hant': 'yyyy.M.d',
  'es-419': 'd MMM, yyyy',
  es: 'd MMM, yyyy',
  it: 'd MMM, yyyy',
  de: 'd. MMM yyyy',
  fr: 'd MMM. yyyy',
  'pt-BR': "d 'de' MMM 'de' yyyy",
};

async function fetchDocument(url: string, siteLang: string): Promise<HtmlElement> {
  const response = await http.get(url, {
    // The desktop user agent is required: the mobile layout breaks all selectors.
    headers: { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/${siteLang}` },
  });
  return html.load(response.body, { baseUrl: response.url });
}

/** Decodes the \uXXXX escapes and drops the \n \r \ escapes of the ajax search html. */
function clearHtml(text: string): string {
  return text
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/(\\n)|(\\r)|(\\{1})/g, '');
}

export default defineExtension({
  createSource: (info: SourceInfo) => {
    const lang = info.lang;
    const siteLang = SITE_LANG[lang] ?? lang;
    const pattern = DATE_PATTERN[lang] ?? 'MMM d, yyyy';
    const referer = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/${siteLang}` };

    const parseList = (document: HtmlElement): MangaPage => ({
      items: document.select('li > div.visual a:has(img)').flatMap((el): MangaSummary[] => {
        const title = el.selectFirst('h4[class$=title]')?.text();
        if (!title) return [];
        const img = el.selectFirst('img');
        return [
          {
            title,
            thumbnailUrl: (img?.attr('data-original') || img?.attr('src')) ?? undefined,
            // The path segment '/search/Y' bypasses the age check and prevents redirection to the chapter.
            url: `${relativeUrl(el.absUrl('href') || el.attr('href') || '')}/search/Y`,
          },
        ];
      }),
      hasNextPage: false,
    });

    return {
      baseUrl: BASE_URL,

      async getPopular(): Promise<MangaPage> {
        return parseList(await fetchDocument(`${BASE_URL}/${siteLang}/webtoon/ranking`, siteLang));
      },

      // No getLatest: /webtoon/new_comics no longer lists any comics.

      async search(query: string): Promise<MangaPage> {
        const response = await http.post<{ webtoon: { sHtml: string } }>(
          `${BASE_URL}/${siteLang}/webtoon/ajax_search`,
          { form: { toonData: query } },
          { headers: referer, responseType: 'json' },
        );
        const document = html.load(`<div>${clearHtml(response.body.webtoon.sHtml)}</div>`, { baseUrl: BASE_URL });
        const items = document.select('#search-list-items li').flatMap((el): MangaSummary[] => {
          const title = el.selectFirst('strong')?.text();
          const anchor = el.selectFirst('a.relative');
          if (!title || !anchor) return [];
          const raw = (anchor.attr('href') ?? '').split("Base.setFamilyMode('N', '").pop()!.split("'")[0]!;
          let decoded = raw;
          try {
            decoded = decodeURIComponent(raw);
          } catch {
            // keep the raw value
          }
          const toon = /[?&]toon=(\d+)/.exec(decoded)?.[1];
          if (!toon) return [];
          return [
            {
              title,
              thumbnailUrl: el.selectFirst('img')?.absUrl('src') || undefined,
              url: `/${siteLang}/webtoon/episode/toon/${toon}/search/Y`,
            },
          ];
        });
        return { items, hasNextPage: false };
      },

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const document = await fetchDocument(`${BASE_URL}${manga.url}`, siteLang);
        const header = document.selectFirst('#glo_contents section.relative:has(img[src*=thumb])');
        const title = header?.selectFirst('h2')?.text();
        if (!header || !title) throw new Error('Could not find manga details header');
        const creators = header.select("a[href*='searchtype=author']").map((a) => a.text());
        const genres = (header.selectFirst('h2 + div li:nth-child(2)')?.text().split('·') ?? []).concat(
          header.select('a[data-tag-name]').map((a) => a.attr('data-tag-name') ?? ''),
        );
        return {
          url: manga.url,
          title,
          artist: creators[0],
          author: creators[creators.length - 1],
          genres: [...new Set(genres.map((g) => g.trim()).filter(Boolean))],
          description: header.selectFirst('.break-noraml.text-xs')?.text(),
          thumbnailUrl: document.selectFirst("head meta[property='og:image']")?.attr('content') || manga.thumbnailUrl,
          status: 'unknown',
        };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const document = await fetchDocument(`${BASE_URL}${manga.url}`, siteLang);
        // coin-type1 - free chapter, coin-type6 - already read chapter
        const chapters = document.select('li.normal_ep:has(.coin-type1, .coin-type6)').flatMap((el): Chapter[] => {
          const num = el.selectFirst('div.cell-num')?.text() ?? '';
          const title = el.selectFirst('div.cell-title strong')?.text() ?? '';
          const onclick = el.selectFirst('a')?.attr('onclick');
          if (!onclick) return [];
          const href = onclick.split("href='")[1]?.split("'")[0] ?? '';
          const number = Number.parseFloat(num);
          return [
            {
              url: relativeUrl(href),
              name: `${num ? `${num} - ` : ''}${title}`,
              number: Number.isNaN(number) ? undefined : number,
              scanlator: 'Toomics',
              uploadedAt: parseDate(el.selectFirst('div.cell-time time')?.text(), pattern),
            },
          ];
        });
        return chapters.reverse();
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        let document = await fetchDocument(`${BASE_URL}${chapter.url}`, siteLang);
        if (document.selectFirst('div.section_age_verif')) {
          // Same request the site's "Yes, I'm over 18" button makes; stores adult display mode in the session.
          await http.get(`${BASE_URL}/${siteLang}/index/set_display/?display=A&return=%2F${siteLang}`, {
            headers: referer,
          });
          document = await fetchDocument(`${BASE_URL}${chapter.url}`, siteLang);
          if (document.selectFirst('div.section_age_verif')) throw new Error('Verify your age in the browser first');
        }
        return document
          .select('div[id^=load_image_] img')
          .map((img, index) => ({ index, imageUrl: img.attr('data-src') ?? '' }));
      },

      imageHeaders: () => referer,

      getWebUrl: (item) => `${BASE_URL}${item.url}`,
    };
  },
});
