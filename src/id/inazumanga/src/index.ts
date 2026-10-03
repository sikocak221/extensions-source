import { type HtmlElement, type Page, defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class ReYume extends ZeistManga {
  readonly name = 'ReYume';
  readonly baseUrl = 'https://www.re-yume.my.id';

  override popularMangaSelector = '.pop-card';
  override popularMangaSelectorTitle = 'h4 a';
  override popularMangaSelectorUrl = 'h4 a';
  override mangaDetailsSelector = '#Blog1';
  override mangaDetailsSelectorDescription = '#synopsis p';
  override mangaDetailsSelectorGenres = '#append-info .col-span-2 a[rel=tag]';
  override mangaDetailsSelectorAuthor = '#extra-info dl:has(dt:contains(Author)) dd';
  override mangaDetailsSelectorArtist = '#extra-info dl:has(dt:contains(Artist)) dd';
  override mangaDetailsSelectorAltName = '#extra-info dl:has(dt:contains(Alternative)) dd';
  override mangaDetailsSelectorStatus = 'span[data-bg]';
  override mangaDetailsSelectorInfo = '#append-info > div';
  override mangaDetailsSelectorInfoTitle = 'dt';
  override mangaDetailsSelectorInfoDescription = 'dd';
  override pageListSelector = '.separator';

  override pageListParse(document: HtmlElement): Page[] {
    const raw = document.selectFirst('textarea#zeist-raw-data')?.text() ?? '';
    return super.pageListParse(html.load(raw, { baseUrl: this.baseUrl }));
  }
}

export default defineExtension({
  createSource: () => new ReYume().toSource(),
});
