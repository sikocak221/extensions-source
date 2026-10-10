import { type Chapter, type HtmlElement, type Page, defineExtension } from '@matane/extension-sdk';
import { USER_AGENT, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://www.dragonball-multiverse.com';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const INTERNAL_LANG: Record<string, string> = {
  en: 'en',
  fr: 'fr',
  ja: 'jp',
  zh: 'cn',
  es: 'es',
  it: 'it',
  pt: 'pt',
  de: 'de',
  pl: 'pl',
  nl: 'nl',
  tr: 'tr_TR',
  'pt-BR': 'pt_BR',
  hu: 'hu_HU',
  ga: 'ga_ES',
  ca: 'ct_CT',
  no: 'no_NO',
  ru: 'ru_RU',
  ro: 'ro_RO',
  eu: 'eu_EH',
  lt: 'lt_LT',
  hr: 'hr_HR',
  ko: 'kr_KR',
  fi: 'fi_FI',
  he: 'he_HE',
  bg: 'bg_BG',
  sv: 'sv_SE',
  el: 'gr_GR',
  'es-419': 'es_CO',
  ar: 'ar_JO',
  fil: 'tl_PI',
  la: 'la_LA',
  da: 'da_DK',
  co: 'co_FR',
  br: 'br_FR',
  vec: 'xx_VE',
  lmo: 'xx_LMO',
};

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers: HEADERS });
  return html.load(response.body, { baseUrl: response.url });
}

export default defineExtension({
  createSource: ({ key, lang }) => {
    const internalLang = key === 'fr-parody' ? 'fr_PA' : (INTERNAL_LANG[lang] ?? lang);
    async function listing() {
      const document = await fetchDocument(`${BASE_URL}/${internalLang}/read.html`);
      const items = document.select('#dbm-reads .dbm-read').map((element) => ({
        url: relativeUrl(element.selectFirst('a')?.absUrl('href') ?? ''),
        title: element.selectFirst('h3')?.text() ?? '',
        thumbnailUrl: element.selectFirst('img')?.absUrl('src'),
        description: element.selectFirst('> div')?.text(),
      }));
      return items.filter((m) => m.url && m.title);
    }

    return {
      baseUrl: BASE_URL,
      getPopular: async () => ({ items: await listing(), hasNextPage: false }),
      search: async (query) => {
        const q = query.trim().toLowerCase();
        return { items: (await listing()).filter((m) => m.title.toLowerCase().includes(q)), hasNextPage: false };
      },
      getMangaDetails: async (manga) => {
        // the description only exists in the listing; the details still work when the site resets the connection
        const entry = await listing()
          .then((items) => items.find((m) => m.url === manga.url))
          .catch(() => undefined);
        return {
          url: manga.url,
          title: entry?.title ?? manga.title,
          thumbnailUrl: entry?.thumbnailUrl ?? manga.thumbnailUrl,
          description: entry?.description,
          status: 'unknown',
        };
      },
      getChapters: async (manga): Promise<Chapter[]> => {
        const document = await fetchDocument(BASE_URL + manga.url);
        return document
          .select('.cadrelect.chapter')
          .map((element) => ({
            url: relativeUrl(element.selectFirst('a[href]')?.absUrl('href') ?? ''),
            name: element.selectFirst('h4')?.text() ?? '',
          }))
          .reverse();
      },
      getPages: async (chapter): Promise<Page[]> => {
        const document = await fetchDocument(BASE_URL + chapter.url);
        return document
          .select('.pageslist a[href]')
          .map((a, index) => ({ index, url: a.absUrl('href') || a.attr('href') }));
      },
      // Tachiyomi also draws the speech-balloon texts onto the image; the sandbox cannot draw text.
      getImageUrl: async (page) => {
        const document = await fetchDocument(page.url ?? '');
        const element = document.selectFirst('#balloonsimg');
        if (!element) throw new Error('Page image not found');
        if (element.attr('src')) return element.absUrl('src') ?? '';
        const inner = element.selectFirst('img');
        if (inner) return inner.absUrl('src') ?? '';
        const style = element.attr('style') ?? '';
        const raw =
          style
            .split('url(')[1]
            ?.split(')')[0]
            ?.replace(/^["']|["']$/g, '') ?? '';
        return raw.startsWith('http') ? raw : BASE_URL + raw;
      },
      imageHeaders: () => HEADERS,
      resolveUrl: (url) => (hostOf(url) === hostOf(BASE_URL) ? { url: relativeUrl(url), title: '' } : null),
      getWebUrl: (item) => BASE_URL + item.url,
    };
  },
});
