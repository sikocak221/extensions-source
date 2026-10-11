import { type Chapter, type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class MangaForFreenet extends Madara {
  constructor(readonly lang: string) {
    super();
  }

  readonly name = 'MangaForFree.net';
  readonly baseUrl = 'https://mangaforfree.net';

  override chapterMode = 'AdminAjax' as const;

  override async parseChapterList(document: HtmlElement, mangaPath: string): Promise<Chapter[]> {
    const chapters = await super.parseChapterList(document, mangaPath);
    if (this.lang === 'en') return chapters.filter((c) => !/raw/i.test(c.name));
    if (this.lang === 'ko') return chapters.filter((c) => /raw/i.test(c.name));
    return chapters;
  }
}

export default defineExtension({
  createSource: ({ lang }) => new MangaForFreenet(lang).toSource(),
});
