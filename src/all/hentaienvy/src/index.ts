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

class HentaiEnvy extends GalleryAdults {
  readonly name = 'HentaiEnvy';
  readonly baseUrl = 'https://hentaienvy.com';

  override languageName(lang: string): string {
    const name = LANGS[lang];
    if (name === undefined) throw new Error(`Invalid lang: ${lang}`);
    return name;
  }

  override supportsLatest() {
    return this.mangaLang !== '';
  }
  override supportAdvancedSearch = true;
  override supportSpeechless = true;
  override mangaLangOf(element: HtmlElement) {
    return last(element.selectFirst('.hnv-gallery-card__flag')?.attr('href') ?? '');
  }
  override popularMangaSelector() {
    return '.hnv-gallery-card';
  }
  override mangaThumbnail(element: HtmlElement) {
    return imgAttr(element.selectFirst('a.hnv-gallery-card__cover img'));
  }
  override mangaTitleSelector = '.hnv-gallery-card__title';
  override mangaUrl(element: HtmlElement) {
    return element.selectFirst('a.hnv-gallery-card__cover')?.absUrl('href');
  }
  override basicSearchKey = 'key';
  override advancedSearchUri = 'advanced-search';
  override favoritePath = 'inc/user.php?act=favs';

  override mangaDetailInfoSelector = '.hnv-gallery-details';
  override getInfoSelector(tag: string) {
    return `div.hnv-gallery-entity-group:has(:contains("${tag}:")) a.hnv-gallery-tag`;
  }
  override infoTagName(element: HtmlElement) {
    return element.selectFirst('.hnv-gallery-tag__name')?.text() ?? ownText(element);
  }
  override getCover(element: HtmlElement) {
    return imgAttr(element.selectFirst('.hnv-gallery-cover img'));
  }
  override galleryId(element: HtmlElement) {
    return element.selectFirst('[data-gallery-id]')?.attr('data-gallery-id') ?? '';
  }
  override totalPages(element: HtmlElement) {
    return element.selectFirst('[data-total-pages]')?.attr('data-total-pages') ?? '';
  }
  override parsingImagePageByPage = true;
  override tagsParser(document: HtmlElement): [string, string][] {
    return document
      .select('ul.hnv-legacy-taxonomy__items a')
      .map((a): [string, string] => [a.attr('title') ?? '', last(a.attr('href') ?? '')]);
  }
  override extraFilters(): Filter[] {
    return [{ type: 'header', label: "String query search doesn't support Sort" }];
  }
}

export default defineExtension({
  preferences: () => new HentaiEnvy('all').preferences(),
  createSource: (info) => new HentaiEnvy(info.lang).toSource(),
});
