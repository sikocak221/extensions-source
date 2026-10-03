import { type HtmlElement, type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class GEDEComix extends Madara {
  readonly name = 'GEDE Comix';
  override mangaDetailsSelectorThumbnail = 'div.summary_image img:not([data-eio])';

  // Lazy-load placeholders carry data-eio; the real cover is the other image.
  override archiveManga(element: HtmlElement): MangaSummary | null {
    const manga = super.archiveManga(element);
    const cover = this.imageFromElement(element.selectFirst('img:not([data-eio])'));
    return manga && cover ? { ...manga, thumbnailUrl: cover } : manga;
  }

  readonly baseUrl = 'https://gedecomix.com';

  override mangaSubString = 'porncomic';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new GEDEComix().toSource(),
});
