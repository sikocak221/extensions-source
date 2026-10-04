import { type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class ComicVerse extends ZeistManga {
  readonly name = 'Comic Verse';
  readonly baseUrl = 'https://arcomixverse.blogspot.com';

  override getChapterFeedUrl(document: HtmlElement, _mangaTitle: string): string {
    return super.getChapterFeedUrl(document, document.selectFirst('[data-label]')?.attr('data-label') ?? '');
  }
}

export default defineExtension({
  createSource: () => new ComicVerse().toSource(),
});
