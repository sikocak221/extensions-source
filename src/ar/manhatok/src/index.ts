import { type Chapter, type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class Manhatok extends ZeistManga {
  readonly name = 'Manhatok';
  readonly baseUrl = 'https://manhatok.blogspot.com';

  // The blog also labels its "image-host" helper posts as chapters; they have no title.
  override async getChapterList(feedUrl: string, document?: HtmlElement): Promise<Chapter[]> {
    return (await super.getChapterList(feedUrl, document)).filter((chapter) => chapter.name.trim());
  }
}

export default defineExtension({
  createSource: () => new Manhatok().toSource(),
});
