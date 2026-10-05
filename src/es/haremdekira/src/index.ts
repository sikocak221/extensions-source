import { defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class HaremdeKira extends MadaraNoAjax {
  readonly name = 'Harem de Kira';
  readonly baseUrl = 'https://kiraproject.lat';

  override chapterDatePattern = 'dd/MM/yyyy';
  override mangaSubString = 'serie';
  override archiveSelector(): string {
    return 'button.group';
  }
  override archiveUrlSelector = 'a';
  override archiveTitleSelector = 'h3';
  override mangaDetailsSelectorTitle = 'div.wp-manga div.grid > h1';
  override mangaDetailsSelectorStatus = 'div.wp-manga div[alt=type]:eq(0) > span';
  override mangaDetailsSelectorGenre = 'div.wp-manga div[alt=type]:gt(0) > span';
  override mangaDetailsSelectorDescription = 'div.wp-manga div#expand_content';
  override chapterListSelector(): string {
    return 'ul#list-chapters li';
  }
  override chapterNameSelector = 'div.grid > span';
  override chapterDateSelector = 'div.grid > div';
  override chapterUrlSelector = 'a';
}

export default defineExtension({
  createSource: () => new HaremdeKira().toSource(),
});
