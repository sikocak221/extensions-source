import { type Chapter, type HtmlElement, type Page, defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class DoujinsHell extends Madara {
  readonly name = 'DoujinsHell';
  readonly baseUrl = 'https://doujinshell.net';

  override chapterDatePattern = 'd MMMM, yyyy';
  override chapterMode = 'MangaAjax' as const;
  override mangaSubString = 'doujin';
  override filterNonMangaItems = false;
  override pageListParseSelector = '.reading-content img:not(.aligncenter)';
  override chapterListSelector(): string {
    return 'div.listing-chapters_wrap li.wp-manga-chapter';
  }

  override async parseChapterList(document: HtmlElement, mangaPath: string): Promise<Chapter[]> {
    const chapters = await super.parseChapterList(document, mangaPath);
    if (chapters.length === 1) chapters[0]!.name = 'Capítulo';
    return chapters;
  }

  override parsePages(document: HtmlElement): Page[] {
    const pages = super.parsePages(document);
    if (pages.length === 0 && document.select('.reading-content iframe').length > 0) {
      throw new Error('No se admiten vídeos');
    }
    return pages;
  }
}

export default defineExtension({
  createSource: () => new DoujinsHell().toSource(),
});
