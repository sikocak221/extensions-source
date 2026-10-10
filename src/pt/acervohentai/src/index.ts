import { type Chapter, type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class AcervoHentai extends Madara {
  readonly name = 'Acervo Hentai';
  readonly baseUrl = 'https://acervohentai.com';

  override chapterDatePattern = 'dd/MM/yyyy';
  override mangaSubString = 'manhwa';
  override genreDirectory = 'tag-manhwa';
  override chapterMode = 'MangaAjax' as const;
  override mangaDetailsSelectorStatus = 'div.post-status .summary-heading:contains(Status) + .summary-content';

  // Site lists chapters in ascending order
  override async parseChapterList(document: HtmlElement, mangaPath: string): Promise<Chapter[]> {
    return (await super.parseChapterList(document, mangaPath)).reverse();
  }
}

export default defineExtension({
  createSource: () => new AcervoHentai().toSource(),
});
