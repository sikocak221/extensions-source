import { type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class PinkRosa extends ZeistManga {
  readonly name = 'Pink Rosa';
  readonly baseUrl = 'https://scanpinkrosa.blogspot.com';

  override supportsLatest = false;
  override mangaDetailsSelector = '#main';
  override mangaDetailsSelectorAuthor = '#tauther';
  override mangaDetailsSelectorDescription = '#syn_bod';
  override mangaDetailsSelectorGenres = 'a[href*=label][rel]';
  override mangaDetailsSelectorStatus = 'div[class*=bg-green] span';
  override mangaDetailsSelectorThumbnail = '.hidden img';
  override pageListSelector = 'div.separator';

  override getChapterFeedUrl(document: HtmlElement, _mangaTitle: string): string {
    const label = document.selectFirst('.chapter_get')?.attr('data-labelchapter') ?? '';
    return super.getChapterFeedUrl(document, label);
  }
}

export default defineExtension({
  createSource: () => new PinkRosa().toSource(),
});
