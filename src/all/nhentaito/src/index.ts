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

class NHentaiTo extends GalleryAdults {
  readonly name = 'NHentai.to';
  readonly baseUrl = 'https://nhentai.to';

  override languageName(lang: string): string {
    const name = LANGS[lang];
    if (name === undefined) throw new Error(`Invalid lang: ${lang}`);
    return name;
  }

  override supportSpeechless = true;
  override searchPopularPath = '';
  override supportsFilterFetching = false;

  override sortOrderUris(): [string, string][] {
    return [
      ['Relevance', 'relevance'],
      ['Newest', 'newest'],
      ['Most favorited', 'most-favorited'],
      ['Most Liked', 'most-liked'],
    ];
  }

  override popularMangaUrl() {
    return this.basicSearchUrl(0, '', { sort: 'most-favorited' });
  }

  override latestUpdatesUrl() {
    return this.basicSearchUrl(0, '', { sort: 'newest' });
  }

  override popularMangaSelector() {
    return '.gallery a:not([rel~=sponsored])';
  }
  override popularMangaNextPageSelector() {
    return 'a.next';
  }
  override mangaUrl(element: HtmlElement) {
    return element.absUrl('href');
  }
  // The site lists image mirrors per image (data-fallbacks); only the main url is used.
  override getCover(element: HtmlElement) {
    return imgAttr(element.selectFirst('#cover img')) || undefined;
  }
  override mangaThumbnail(element: HtmlElement) {
    return imgAttr(element.selectFirst('img')) || undefined;
  }

  override mangaDetailInfoSelector = '#bigcontainer';
  override idPrefixUri = 'g';
  override getInfoSelector(tag: string) {
    return `#info-block .field-name:contains("${tag}") .tags a`;
  }
  override infoTagName(element: HtmlElement) {
    return ownText(element.selectFirst('.name'));
  }
  override serverPrefix = 'i';
  override totalPages(element: HtmlElement) {
    return this.getInfo(element, 'Pages');
  }
  override getTime(element: HtmlElement) {
    return parseDateText(element.selectFirst('.tags time')?.attr('datetime'));
  }
  override thumbnailSelector = '#thumbnail-container .thumb-container';

  override basicSearchUrl(_page: number, query: string, filters: FilterState) {
    const params: [string, string][] = [['q', encodeURIComponent(query.trim() || '*')]];
    params.push(['sort', this.sortOrderUris()[this.sortIndex(filters)]![1]]);
    if (typeof filters.exclude === 'string' && filters.exclude.trim())
      params.push(['exclude', encodeURIComponent(filters.exclude)]);
    params.push(['lang', this.mangaLang]);
    return `${this.baseUrl}/search?${this.queryString(params)}`;
  }

  override extraFilters(): Filter[] {
    return [{ type: 'text', id: 'exclude', label: 'Exclude Tags (seperate by comma)' }];
  }
}

export default defineExtension({
  preferences: () => new NHentaiTo('all').preferences(),
  createSource: (info) => new NHentaiTo(info.lang).toSource(),
});
