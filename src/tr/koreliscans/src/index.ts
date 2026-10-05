import { type Chapter, type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class KoreliScans extends MangaThemesia {
  readonly name = 'Koreli Scans';
  readonly baseUrl = 'https://www.nabicix.com';

  // Chapter rows are heavy here (thumbnails, badges): yield more often than the theme does.
  override async chapterListParse(document: HtmlElement): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    const elements = document.select(this.chapterListSelector());
    for (let i = 0; i < elements.length; i++) {
      if (i % 40 === 0) await timers.sleep(0);
      const chapter = this.chapterFromElement(elements[i]!);
      if (chapter.url) chapters.push(chapter);
    }
    return chapters;
  }
}

export default defineExtension({
  createSource: () => new KoreliScans().toSource(),
});
