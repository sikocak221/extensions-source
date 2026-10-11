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

class HentaiEra extends GalleryAdults {
  readonly name = 'HentaiEra';
  readonly baseUrl = 'https://hentaiera.com';

  override languageName(lang: string): string {
    const name = LANGS[lang];
    if (name === undefined) throw new Error(`Invalid lang: ${lang}`);
    return name;
  }

  override useIntermediateSearch = true;
  override supportSpeechless = true;
  override mangaTitleSelector = '.gallery_title';
  override mangaLangOf(element: HtmlElement) {
    const href = element.selectFirst('a:has(.g_flag)')?.attr('href');
    if (href) return last(href);
    const flag = (element.selectFirst('.g_flag')?.attr('class') ?? '')
      .split(/\s+/)
      .find((c) => c.startsWith('flag-'))
      ?.slice(5);
    const flags = new Map(this.languageUris().map(([name, uri]) => [uri, name]));
    if (!flags.has('us')) flags.set('us', LANGUAGE_ENGLISH);
    return (flag && flags.get(flag)) || this.mangaLang;
  }
  override popularMangaUrl() {
    // LANGUAGE_MULTI popular
    return this.mangaLang === '' ? this.basicSearchUrl(0, '', {}) : super.popularMangaUrl();
  }
  override getInfoSelector(tag: string) {
    return `li:has(.tags_text:contains("${tag}")) .tag .item_name`;
  }
  override getCover(element: HtmlElement) {
    return imgAttr(element.selectFirst('.left_cover img'));
  }
  override tagsParser(document: HtmlElement): [string, string][] {
    return document
      .select('.galleries .gallery_title a')
      .map((a): [string, string] => [ownText(a), last(a.attr('href') ?? '')]);
  }
  override mangaDetailInfoSelector = '.gallery_first';
  override thumbnailSelector = '.gthumb';
  override pageUri = 'view';
  override categoryUris(): [string, string, boolean?][] {
    return [
      ['Manga', 'mg'],
      ['Doujinshi', 'dj'],
      ['Western', 'ws'],
      ['Image Set', 'is'],
      ['Artist CG', 'ac'],
      ['Game CG', 'gc'],
    ];
  }
}

export default defineExtension({
  preferences: () => new HentaiEra('all').preferences(),
  createSource: (info) => new HentaiEra(info.lang).toSource(),
});
