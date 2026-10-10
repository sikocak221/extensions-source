import {
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import {
  GalleryAdults,
  LANGUAGE_CHINESE,
  LANGUAGE_ENGLISH,
  LANGUAGE_FRENCH,
  LANGUAGE_GERMAN,
  LANGUAGE_JAPANESE,
  LANGUAGE_KOREAN,
  LANGUAGE_MULTI,
  LANGUAGE_RUSSIAN,
  LANGUAGE_SPANISH,
  imgAttr,
  ownText,
  parseDateText,
} from './galleryadults/GalleryAdults';
import { relativeUrl } from './galleryadults/utils';

const LANGS: Record<string, string> = {
  en: LANGUAGE_ENGLISH,
  ja: LANGUAGE_JAPANESE,
  zh: LANGUAGE_CHINESE,
  ko: LANGUAGE_KOREAN,
  es: LANGUAGE_SPANISH,
  fr: LANGUAGE_FRENCH,
  de: LANGUAGE_GERMAN,
  ru: LANGUAGE_RUSSIAN,
  all: LANGUAGE_MULTI,
};
const last = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? '';
void [imgAttr, ownText, parseDateText, relativeUrl, last];

class HentaiFox extends GalleryAdults {
  readonly name = 'HentaiFox';
  readonly baseUrl = 'https://hentaifox.com';

  override languageName(lang: string): string {
    const name = LANGS[lang];
    if (name === undefined) throw new Error(`Invalid lang: ${lang}`);
    return name;
  }

  private csrfToken: string | undefined;

  private get langCode() {
    return {
      [LANGUAGE_ENGLISH]: '1',
      translated: '2',
      [LANGUAGE_JAPANESE]: '5',
      [LANGUAGE_CHINESE]: '6',
      [LANGUAGE_KOREAN]: '11',
    }[this.mangaLang];
  }

  override supportsLatest() {
    return this.mangaLang !== '';
  }

  override xhrHeaders() {
    return { ...super.xhrHeaders(), ...(this.csrfToken ? { 'X-Csrf-Token': this.csrfToken } : {}) };
  }

  override async fetchDocument(url: string) {
    const document = await super.fetchDocument(url);
    const token = document.selectFirst('[name=csrf-token]')?.attr('content');
    if (token) this.csrfToken = token;
    return document;
  }

  override mangaLangOf(element: HtmlElement) {
    const languages = (element.attr('data-languages') ?? '').split(' ');
    if (this.langCode && languages.includes(this.langCode)) return this.mangaLang;
    // Search results have no "data-languages", which gives a list with one blank element.
    if (languages.length > 1 || (languages.length === 1 && languages[0]!.trim() !== '')) return 'other';
    // Without a language to filter on, filter nothing.
    return this.mangaLang;
  }

  override getInfoSelector(tag: string) {
    return `ul.${tag.toLowerCase()} a`;
  }

  override getTime(element: HtmlElement) {
    const text = ownText(element.selectFirst('.pages:contains("Posted:")'));
    return parseDateText(text.replace(/^Posted: /, ''));
  }

  override addPageUri(url: string, page: number) {
    if (url === `${this.baseUrl}/` && page === 2) return `${url}page/${page}/`;
    if (url.includes('?')) return `${url}&page=${page}`;
    return `${url.replace(/\/+$/, '')}/pag/${page}/`;
  }

  /**
   * Spaces typed in the search box become plus (+): words preceded by a special character are joined with a plus
   * ('school-girl' ignores 'girl'), plus separates terms (AND) and double quotes search for an exact match.
   */
  override buildQueryString(tags: string[], query: string) {
    const special = /[^a-zA-Z0-9"]+(?=[a-zA-Z0-9"])/g;
    return [...tags, query, this.mangaLang]
      .filter((s) => s.trim() !== '')
      .map((s) => s.trim().replace(special, '+'))
      .join('+');
  }

  override favoritePath = 'includes/user_favs.php';
  override pagesRequest = 'includes/thumbs_loader.php';

  override extraFilters(): Filter[] {
    return [{ type: 'header', label: 'HINT: Use double quote (") for exact match' }];
  }

  private static readonly SIDEBAR: [string, string][] = [
    ['Top Rated', 'top_rated'],
    ['Most Faved', 'top_faved'],
    ['Most Fapped', 'top_fapped'],
    ['Most Downloaded', 'top_downloaded'],
  ];

  override sortOrderUris(): [string, string][] {
    return [...super.sortOrderUris(), ...HentaiFox.SIDEBAR];
  }

  override async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    // Sidebar manga always override any other search; only a "normal" search goes to the base class.
    const sidebar = HentaiFox.SIDEBAR.find(([, uri]) => uri === filters.sort);
    if (sidebar) {
      if (!this.csrfToken) await this.fetchDocument(`${this.baseUrl}/`);
      const response = await http.post(
        `${this.baseUrl}/includes/sidebar.php`,
        { form: { type: sidebar[1] } },
        { headers: this.xhrHeaders() },
      );
      const document = html.load(response.body, { baseUrl: this.baseUrl });
      const items: MangaSummary[] = [];
      for (const item of document.select('div.item')) {
        const title = item.selectFirst('img')?.attr('alt');
        const url = item.selectFirst('a')?.absUrl('href');
        if (title === undefined || !url) continue;
        items.push({ title, url: relativeUrl(url), thumbnailUrl: imgAttr(item.selectFirst('img')) });
      }
      return { items, hasNextPage: false };
    }
    return super.search(query, page, filters);
  }
}

export default defineExtension({
  preferences: () => new HentaiFox('all').preferences(),
  createSource: (info) => new HentaiFox(info.lang).toSource(),
});
