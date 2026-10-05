import { type HtmlElement, type MangaDetails, defineExtension } from '@matane/extension-sdk';
import { ownText } from './mmrcms/utils';
import { MMRCMS } from './mmrcms/MMRCMS';

class Onma extends MMRCMS {
  readonly name = 'Onma';
  readonly baseUrl = 'https://onma.top';
  readonly lang = 'ar';

  override detailsTitleSelector = '.panel-heading';
  override mangaDetailsParse(document: HtmlElement): MangaDetails {
    const details = super.mangaDetailsParse(document);
    for (const element of document.select('.panel-body h3')) {
      const key = ownText(element).toLowerCase().replace(/ :$/, '');
      const value = element.selectFirst('div.text');
      if (!value) continue;
      if (this.detailAuthor.includes(key)) details.author = value.text();
      else if (this.detailArtist.includes(key)) details.artist = value.text();
      else if (this.detailGenre.includes(key)) details.genres = value.select('a').map((a) => a.text());
      else if (this.detailStatus.includes(key)) details.status = this.toStatus(value.text());
    }
    return details;
  }
  override searchMangaSelector(): string {
    return 'div.chapter-container';
  }
}

export default defineExtension({
  createSource: () => new Onma().toSource(),
});
