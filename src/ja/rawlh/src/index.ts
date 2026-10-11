import {
  type Chapter,
  type HtmlElement,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { FMReader } from './fmreader/FMReader';
import { relativeUrl } from './fmreader/utils';

class WeLoveManga extends FMReader {
  readonly name = 'WeLoveManga';
  readonly baseUrl = 'https://weloma.net';

  override chapterUrlSelector = '';

  override pageListParse(document: HtmlElement, _chapter: Chapter): Page[] {
    return this.base64PageListParse(document);
  }

  override popularMangaFromElement(element: HtmlElement): MangaSummary {
    const header = element.selectFirst(this.headerSelector());
    const style = element.selectFirst('div.content.img-in-ratio')?.attr('style') ?? '';
    return {
      url: relativeUrl(header?.absUrl('href') ?? ''),
      title: element
        .select(this.headerSelector())
        .map((e) => e.text())
        .join(' ')
        .trim(),
      thumbnailUrl: /url\(['"]?(.*?)['"]?\)/.exec(style)?.[1],
    };
  }
}

export default defineExtension({
  createSource: () => new WeLoveManga().toSource(),
});
