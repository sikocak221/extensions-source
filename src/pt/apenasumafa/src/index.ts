import { type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class ApenasUmaF extends ZeistManga {
  readonly name = 'Apenas Uma Fã';
  readonly baseUrl = 'https://apenasuma-fa.blogspot.com';

  override supportsLatest = false;
  override mangaDetailsSelector = '#main';
  override mangaDetailsSelectorArtist = 'span#tartist';
  override mangaDetailsSelectorAuthor = 'span#tauther';
  override mangaDetailsSelectorDescription = '#syn_bod';
  override mangaDetailsSelectorGenres = "a[href*='search/label'].leading-none";
  override mangaDetailsSelectorStatus = 'div[class*=bg-green] span';
  override mangaDetailsSelectorThumbnail = '.hidden img';
  override pageListSelector = '#reader div.separator';

  override getChapterFeedUrl(document: HtmlElement, _mangaTitle: string): string {
    const feed = document.selectFirst('.chapter_get')?.attr('data-labelchapter');
    if (!feed) throw new Error('Failed to find chapter feed');
    return super.getChapterFeedUrl(document, feed);
  }
}

export default defineExtension({
  createSource: () => new ApenasUmaF().toSource(),
});
