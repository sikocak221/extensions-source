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

class NHentaiXXX extends GalleryAdults {
  readonly name = 'NHentai.xxx';
  readonly baseUrl = 'https://nhentai.xxx';

  override languageName(lang: string): string {
    const name = LANGS[lang];
    if (name === undefined) throw new Error(`Invalid lang: ${lang}`);
    return name;
  }

  // This site treats all Speechless as English.
  override supportSpeechless = this.mangaLang === LANGUAGE_ENGLISH;
  private get langCode() {
    return { [LANGUAGE_ENGLISH]: '1', [LANGUAGE_JAPANESE]: '2', [LANGUAGE_CHINESE]: '3' }[this.mangaLang];
  }
  override mangaLangOf(element: HtmlElement) {
    return element.attr('data-languages') === this.langCode ? this.mangaLang : 'other';
  }
  override mangaUrl(element: HtmlElement) {
    return element.selectFirst('.gallery_item a, .fav_item a')?.absUrl('href');
  }
  override mangaThumbnail(element: HtmlElement) {
    return imgAttr(element.selectFirst('.gallery_item img, .fav_item img'));
  }
  override popularMangaUrl() {
    return this.mangaLang === '' ? this.basicSearchUrl(0, '', {}) : super.popularMangaUrl();
  }
  override popularMangaSelector() {
    return '.galleries_box .gallery_item, .fav_item';
  }
  override basicSearchKey = 'key';
  override favoritePath = 'favorites';
  override idPrefixUri = 'g';
  override loginRequired(document: HtmlElement, url: string) {
    return url.includes('/login/') && document.select('button[name=go_login]').length > 0;
  }
  override getInfoSelector(tag: string) {
    return `.tags:contains("${tag}") a.tag_btn`;
  }
  override infoTagName(element: HtmlElement) {
    return ownText(element.selectFirst('.tag_name'));
  }
  override serverPrefix = 'i';
  override parseJson(element: HtmlElement) {
    const script = element.select('script').find((s) => s.html().includes('parseJSON'));
    const data = script?.html();
    if (!data) return undefined;
    const after = data.split('$.parseJSON(\'{"fl":').slice(1).join('$.parseJSON(\'{"fl":');
    return after ? after.split(',"th":')[0]!.trim() : undefined;
  }
}

export default defineExtension({
  preferences: () => new NHentaiXXX('all').preferences(),
  createSource: (info) => new NHentaiXXX(info.lang).toSource(),
});
