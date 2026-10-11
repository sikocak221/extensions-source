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

class HentaiZap extends GalleryAdults {
  readonly name = 'HentaiZap';
  readonly baseUrl = 'https://hentaizap.com';

  override languageName(lang: string): string {
    const name = LANGS[lang];
    if (name === undefined) throw new Error(`Invalid lang: ${lang}`);
    return name;
  }

  override supportSpeechless = true;
  override useIntermediateSearch = true;
  override mangaThumbnail(element: HtmlElement) {
    return imgAttr(element.selectFirst('.hz-gallery-card__media.thumb img'));
  }
  override popularMangaSelector() {
    return '.hz-gallery-card';
  }
  override mangaTitleSelector = '.hz-gallery-card__title a';
  override mangaUrl(element: HtmlElement) {
    return element.selectFirst('.hz-gallery-card__cover')?.absUrl('href');
  }
  override mangaLangOf(element: HtmlElement) {
    return last(element.selectFirst('.hz-gallery-card__flag')?.attr('href') ?? '');
  }
  override basicSearchKey = 'key';
  override mangaDetailInfoSelector = '.hz-gallery-details';
  override getCover(element: HtmlElement) {
    return imgAttr(element.selectFirst('.hz-gallery-cover img'));
  }
  override getInfoSelector(tag: string) {
    return `div.hz-gallery-entity-group:has(:contains("${tag}:")) a.hz-gallery-tag`;
  }
  override infoTagName(element: HtmlElement) {
    return element.selectFirst('.hz-gallery-tag__name')?.text() ?? ownText(element);
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
      .select('ul.hz-legacy-taxonomy__items a')
      .map((a): [string, string] => [
        a.selectFirst('.hz-legacy-taxonomy-item__name')?.text() ?? '',
        last(a.attr('href') ?? ''),
      ]);
  }
}

export default defineExtension({
  preferences: () => new HentaiZap('all').preferences(),
  createSource: (info) => new HentaiZap(info.lang).toSource(),
});
