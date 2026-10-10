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

class AsmHentai extends GalleryAdults {
  readonly name = 'AsmHentai';
  readonly baseUrl = 'https://asmhentai.com';

  override languageName(lang: string): string {
    const name = LANGS[lang];
    if (name === undefined) throw new Error(`Invalid lang: ${lang}`);
    return name;
  }

  override supportsLatest() {
    return this.mangaLang !== '';
  }
  override supportSpeechless = true;
  override mangaLangOf(element: HtmlElement) {
    return last(element.selectFirst('a:has(.flag)')?.attr('href') ?? '');
  }
  override mangaUrl(element: HtmlElement) {
    return element.selectFirst('.image a')?.absUrl('href');
  }
  override mangaThumbnail(element: HtmlElement) {
    return imgAttr(element.selectFirst('.image img'));
  }
  override popularMangaSelector() {
    return '.preview_item';
  }
  override favoritePath = 'inc/user.php?act=favs';
  override getInfoSelector(tag: string) {
    return `.tags:contains("${tag}:") .tag_list a`;
  }
  override infoTagName(element: HtmlElement) {
    return ownText(element.selectFirst('.tag'));
  }
  override getInfoPages(element: HtmlElement) {
    const text = ownText(element.selectFirst('.book_page .pages h3'));
    return text.includes(': ') ? text.split(': ').slice(1).join(': ') : text;
  }
  override mangaDetailInfoSelector = '.book_page';
  /** Only exists if pages > 10. */
  override totalPagesSelector = 't_pages';
  override galleryIdSelector = 'load_id';
  override thumbnailSelector = '.preview_thumb';
  override idPrefixUri = 'g';
  override pageUri = 'gallery';
  override pageRequestForm(document: HtmlElement, totalPages: string, loadedPages: number) {
    const token = document.selectFirst('[name=csrf-token]')?.attr('content') ?? '';
    const form: Record<string, string> = {
      id: this.inputIdValueOf(document, this.loadIdSelector),
      dir: this.inputIdValueOf(document, this.loadDirSelector),
      visible_pages: String(loadedPages),
      t_pages: totalPages,
      type: '2', // 1 would be "more", 2 is "all remaining"
    };
    if (token) form._token = token;
    return form;
  }
  override tagsParser(document: HtmlElement): [string, string][] {
    return document
      .select('.tags_page .tags a.tag')
      .map((a): [string, string] => [ownText(a), last(a.attr('href') ?? '')]);
  }
  override extraFilters(): Filter[] {
    return [
      { type: 'header', label: 'HINT: Separate search term with comma (,)' },
      { type: 'header', label: "String query search doesn't support Sort" },
    ];
  }
}

export default defineExtension({
  preferences: () => new AsmHentai('all').preferences(),
  createSource: (info) => new AsmHentai(info.lang).toSource(),
});
