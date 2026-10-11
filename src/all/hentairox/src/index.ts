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

class HentaiRox extends GalleryAdults {
  readonly name = 'HentaiRox';
  readonly baseUrl = 'https://hentairox.com';

  override languageName(lang: string): string {
    const name = LANGS[lang];
    if (name === undefined) throw new Error(`Invalid lang: ${lang}`);
    return name;
  }

  override supportSpeechless = true;
  override basicSearchKey = 'key';
  override mangaLangOf(element: HtmlElement) {
    return last(element.selectFirst('a:has(.thumb_flag)')?.attr('href') ?? '');
  }
  override mangaTitleSelector = '.gallery_title';
  override popularMangaUrl() {
    return this.mangaLang === '' ? `${this.baseUrl}/top-rated` : super.popularMangaUrl();
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
  override getInfoSelector(tag: string) {
    return `li:has(.tags_text:contains("${tag}")) a.tag`;
  }
  override infoTagName(element: HtmlElement) {
    return ownText(element.selectFirst('.item_name'));
  }
  override getCover(element: HtmlElement) {
    return imgAttr(element.selectFirst('.left_cover img'));
  }
  override mangaDetailInfoSelector = '.gallery_first';
  override thumbnailSelector = '.gthumb';
  override pageUri = 'view';
  override tagsParser(document: HtmlElement): [string, string][] {
    return document
      .select('.gtags .gallery_title a')
      .map((a): [string, string] => [ownText(a), last(a.attr('href') ?? '')]);
  }
}

export default defineExtension({
  preferences: () => new HentaiRox('all').preferences(),
  createSource: (info) => new HentaiRox(info.lang).toSource(),
});
