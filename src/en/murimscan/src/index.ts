import { type HtmlElement, type Page, defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class MurimScan extends ZeistManga {
  readonly name = 'MurimScan';
  readonly baseUrl = 'https://www.murimscans.site';

  override supportsLatest = false;
  override mangaDetailsSelector = 'main';
  override mangaDetailsSelectorGenres = 'dl.flex:contains(Genre) a[rel=tag], dl.flex:contains(Type) a[rel=tag]';
  override mangaDetailsSelectorInfo = 'dl.flex';
  override mangaDetailsSelectorInfoTitle = 'dt';
  override mangaDetailsSelectorInfoDescription = 'dd';
  override pageListSelector = '.post-body, .check-box';

  // The reader keeps the chapter html in a data-post-body attribute.
  override pageListParse(document: HtmlElement): Page[] {
    // The attribute holds a JS-escaped string (\u003c…, \").
    const body = document
      .selectFirst('[data-post-body]')
      ?.attr('data-post-body')
      ?.replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
      .replace(/\\"/g, '"');
    if (body) {
      const pages = html
        .load(body, { baseUrl: this.baseUrl })
        .select('img[src]')
        .map((img) => img.absUrl('src') || img.attr('src') || '')
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
      if (pages.length > 0) return pages;
    }
    return super.pageListParse(document);
  }
}

export default defineExtension({
  createSource: () => new MurimScan().toSource(),
});
