import { type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class YuriMoonSub extends ZeistManga {
  readonly name = 'Yuri Moon Sub';
  readonly baseUrl = 'https://yurimoonsub.blogspot.com';

  override getChapterFeedUrl(document: HtmlElement, mangaTitle: string): string {
    return decodeURIComponent(super.getChapterFeedUrl(document, mangaTitle))
      .replace(/[\u0600-\u06FF]/g, '')
      .replace(/\s{2,}/g, '');
  }
}

export default defineExtension({
  createSource: () => new YuriMoonSub().toSource(),
});
